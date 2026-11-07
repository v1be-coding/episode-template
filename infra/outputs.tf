output "site_bucket" {
  description = "Where this target's site is published."
  value       = local.is_production ? "v1be-${var.episode}-site-${var.account}" : module.branch_edge[0].bucket
}

output "branch_distribution_id" {
  description = "A branch environment's distribution. Production's belongs to v1be-infra."
  value       = local.is_production ? null : module.branch_edge[0].distribution_id
}

output "branch_url" {
  description = "A branch environment's address. Production's is the SITE_URL variable."
  value       = local.is_production ? null : module.branch_edge[0].url
}
