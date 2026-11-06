output "api_url" {
  description = "The API's raw address. Slice 2 puts CloudFront in front of it."
  value       = aws_apigatewayv2_api.api.api_endpoint
}
