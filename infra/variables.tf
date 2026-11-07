variable "account_id" {
  description = "The account to deploy to. It stays out of this public repo."
  type        = string
}

variable "episode" {
  description = "The episode's name, from v1be-infra's list."
  type        = string
}

variable "environment" {
  description = "production, or a branch environment's name."
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
