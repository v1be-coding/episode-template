locals {
  is_production    = var.environment == "production"
  name             = "v1be-${var.episode}-api-${var.environment}"
  api_id           = local.is_production ? one(data.aws_apigatewayv2_apis.production[0].ids) : aws_apigatewayv2_api.branch[0].id
  api_arn          = local.is_production ? data.aws_apigatewayv2_api.production[0].execution_arn : aws_apigatewayv2_api.branch[0].execution_arn
  cluster_endpoint = "${aws_dsql_cluster.db.identifier}.dsql.ap-southeast-1.on.aws"

  # v1be-infra makes production's secret and the alarm topic (Q55, Q61).
  api_origin_secret = local.is_production ? data.aws_ssm_parameter.api_origin[0].value : random_password.api_origin[0].result
  alerts_topic      = "arn:aws:sns:ap-southeast-1:${var.account_id}:v1be-alerts"
}

# CloudFront sends this to the API, and the Lambda refuses requests without it,
# which closes the raw execute-api address (Q55). Kept sensitive, so the plan in
# the public logs hides it.
data "aws_ssm_parameter" "api_origin" {
  count = local.is_production ? 1 : 0

  name = "/${var.episode}/internal/api-origin"
}

resource "random_password" "api_origin" {
  count = local.is_production ? 0 : 1

  length  = 48
  special = false
}

# v1be-infra owns production's API shell, so the distribution can point at it
# before the first deploy (ADR-0010). This adds its routes and stage.
data "aws_apigatewayv2_apis" "production" {
  count = local.is_production ? 1 : 0

  name = "v1be-${var.episode}-api"
}

data "aws_apigatewayv2_api" "production" {
  count = local.is_production ? 1 : 0

  api_id = local.api_id
}

# A branch environment owns everything it uses, so closing its PR removes it all.
resource "aws_apigatewayv2_api" "branch" {
  count = local.is_production ? 0 : 1

  name          = local.name
  protocol_type = "HTTP"
}

module "branch_edge" {
  count  = local.is_production ? 0 : 1
  source = "./branch-edge"

  bucket                   = "v1be-${var.episode}-site-${var.environment}"
  comment                  = "${var.episode}, ${var.environment}"
  api_endpoint             = aws_apigatewayv2_api.branch[0].api_endpoint
  api_origin_secret        = local.api_origin_secret
  origin_access_control_id = var.origin_access_control_id
}

# Only production is protected, so branch environments can be torn down. CI has
# no dsql:UpdateCluster, which is the only way to turn this off (Q45).
resource "aws_dsql_cluster" "db" {
  deletion_protection_enabled = local.is_production

  tags = merge(
    { Name = local.name },
    var.account == "cafe" && var.environment == "production" ? { backup = "weekly" } : {},
  )
}

# The per-IP and spend-cap counters (Q56). Rows expire by themselves.
resource "aws_dynamodb_table" "limits" {
  name         = "v1be-${var.episode}-limits-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  ttl {
    attribute_name = "expires"
    enabled        = true
  }
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "api" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }

  statement {
    actions   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:ap-southeast-1:${var.account_id}:parameter/${var.episode}/*"]
  }

  statement {
    actions   = ["dsql:DbConnect"]
    resources = [aws_dsql_cluster.db.arn]
  }

  statement {
    actions   = ["dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.limits.arn]
  }
}

# Every role CI makes must carry the episode's boundary, or AWS refuses it.
resource "aws_iam_role" "api" {
  name                 = local.name
  assume_role_policy   = data.aws_iam_policy_document.assume.json
  permissions_boundary = "arn:aws:iam::${var.account_id}:policy/v1be-${var.episode}-boundary"
}

resource "aws_iam_role_policy" "api" {
  name   = local.name
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name}"
  retention_in_days = 14
}

resource "aws_lambda_function" "api" {
  function_name    = local.name
  role             = aws_iam_role.api.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = var.api_zip
  source_code_hash = filebase64sha256(var.api_zip)
  timeout          = 10
  memory_size      = 256

  environment {
    variables = {
      CLUSTER_ENDPOINT  = local.cluster_endpoint
      DB_USER           = "api"
      LIMITS_TABLE      = aws_dynamodb_table.limits.name
      API_ORIGIN_SECRET = local.api_origin_secret
      IP_SOURCE         = local.is_production ? "cloudflare" : "api-gateway"
      EPISODE           = var.episode
      TARGET            = var.environment
      DAILY_CAP_USD     = var.daily_cap_usd
    }
  }

  depends_on = [aws_cloudwatch_log_group.api]
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = local.api_id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "api" {
  api_id    = local.api_id
  route_key = "ANY /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = local.api_id
  name        = "$default"
  auto_deploy = true

  # A ceiling on all traffic together, which no caller can get around (Q55).
  # The burst matches portfolio's Lambda limit of 10 runs at once, shared by
  # every episode, so a spike gets a handled 429 here instead of a 503. Raise it
  # to 20 once AWS raises that limit.
  default_route_settings {
    throttling_rate_limit  = 10
    throttling_burst_limit = 10
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${local.api_arn}/*/*"
}

# Production only, as branch tests trip the limit on purpose (Q61). The Lambda
# writes both metrics. Alarms email only when they start firing.
resource "aws_cloudwatch_metric_alarm" "rate_limited" {
  count = local.is_production ? 1 : 0

  alarm_name          = "v1be-${var.episode}-rate-limited"
  alarm_description   = "Someone keeps going over the per-IP limit."
  namespace           = "v1be/${var.episode}"
  metric_name         = "RateLimited"
  dimensions          = { Target = var.environment }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 50
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [local.alerts_topic]
}

resource "aws_cloudwatch_metric_alarm" "spend_cap" {
  count = local.is_production ? 1 : 0

  alarm_name          = "v1be-${var.episode}-spend-cap"
  alarm_description   = "The AI feature reached its daily cap and paused until midnight UTC."
  namespace           = "v1be/${var.episode}"
  metric_name         = "SpendCapReached"
  dimensions          = { Target = var.environment }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [local.alerts_topic]
}
