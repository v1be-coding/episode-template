locals {
  name             = "v1be-${var.episode}-api-${var.environment}"
  api_id           = one(data.aws_apigatewayv2_apis.api.ids)
  cluster_endpoint = "${aws_dsql_cluster.db.identifier}.dsql.ap-southeast-1.on.aws"
}

# v1be-infra owns production's API shell, so the distribution can point at it
# before the first deploy (ADR-0010). This adds its routes and stage.
data "aws_apigatewayv2_apis" "api" {
  name = "v1be-${var.episode}-api"
}

data "aws_apigatewayv2_api" "api" {
  api_id = local.api_id
}

# Only production is protected, so branch environments can be torn down. CI has
# no dsql:UpdateCluster, which is the only way to turn this off (Q45).
resource "aws_dsql_cluster" "db" {
  deletion_protection_enabled = var.environment == "production"

  tags = merge(
    { Name = local.name },
    var.account == "cafe" && var.environment == "production" ? { backup = "weekly" } : {},
  )
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
      CLUSTER_ENDPOINT = local.cluster_endpoint
      DB_USER          = "api"
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
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${data.aws_apigatewayv2_api.api.execution_arn}/*/*"
}
