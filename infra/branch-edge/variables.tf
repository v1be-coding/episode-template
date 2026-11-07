variable "bucket" {
  description = "The site bucket's name. CI can only make v1be-<episode>-site-pr-*."
  type        = string
}

variable "comment" {
  description = "Says what this distribution is, in the AWS console."
  type        = string
}

variable "api_endpoint" {
  description = "The branch API's address."
  type        = string
}

variable "api_origin_secret" {
  description = "Sent to the API on every request, so the Lambda can refuse its raw address (Q55)."
  type        = string
  sensitive   = true
}

variable "origin_access_control_id" {
  description = "The account's origin access control, which v1be-infra owns."
  type        = string
}
