output "bucket" {
  description = "Where the site is published."
  value       = aws_s3_bucket.site.id
}

output "distribution_id" {
  description = "The distribution to clear after publishing."
  value       = aws_cloudfront_distribution.site.id
}

output "url" {
  description = "The branch environment's address."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}
