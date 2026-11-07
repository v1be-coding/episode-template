variable "account_id" {
  description = "The account to deploy to. It stays out of this public repo."
  type        = string
}

variable "episode" {
  description = "The episode's name, from v1be-infra's list."
  type        = string
}

variable "environment" {
  description = "production, or a branch environment's name, such as pr-12."
  type        = string
  default     = "production"
}

variable "api_zip" {
  description = "The built Lambda bundle."
  type        = string
  default     = "../dist/api.zip"
}

variable "account" {
  description = "The account this target lives in: portfolio or cafe."
  type        = string
  default     = "portfolio"
}

variable "origin_access_control_id" {
  description = "The account's origin access control. A branch deploy passes the real ID."
  type        = string

  # Not empty, because the provider refuses that even on a destroy, and teardown
  # has no need to look up the real one.
  default = "unset"
}

variable "daily_cap_usd" {
  description = "The most the AI feature may spend per UTC day on this target (Q60)."
  type        = string
  default     = "1"
}
