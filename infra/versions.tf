terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.69.1"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.9.1"
    }
  }

  # CI passes the bucket and key, because they depend on the episode.
  backend "s3" {
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region              = "ap-southeast-1"
  allowed_account_ids = [var.account_id]

  # The episode tag is how CI's role can touch its own APIs and clusters (ADR-0011).
  default_tags {
    tags = {
      project    = "v1be"
      episode    = var.episode
      managed_by = "terraform"
    }
  }
}
