"""
API Key Secret Rotation Handler

Implements rotation for API keys and tokens that don't require
external service updates. Suitable for:
- Internal API keys
- Symmetric encryption keys
- Service tokens
- Access tokens without external dependencies

For API keys that require external service updates (e.g., third-party APIs),
use the custom rotation handler.
"""

import json
import logging
import boto3
import os
from typing import Dict, Any
import secrets
import string

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
secretsmanager = boto3.client(
    'secretsmanager',
    endpoint_url=os.environ.get('SECRETS_MANAGER_ENDPOINT')
)


def handler(event: Dict[str, Any], context: Any) -> None:
    """
    Main rotation handler for API keys

    Args:
        event: Event data from Secrets Manager
        context: Lambda context object
    """
    logger.info(f"API Key rotation event: {json.dumps(event)}")

    arn = event['SecretId']
    token = event['ClientRequestToken']
    step = event['Step']

    if step == "createSecret":
        create_secret(arn, token)
    elif step == "setSecret":
        set_secret(arn, token)
    elif step == "testSecret":
        test_secret(arn, token)
    elif step == "finishSecret":
        finish_secret(arn, token)
    else:
        raise ValueError(f"Invalid step: {step}")


def create_secret(arn: str, token: str) -> None:
    """
    Generate a new API key

    Creates a cryptographically secure random API key.
    """
    logger.info(f"Creating new API key for {arn}")

    # Check if AWSPENDING version already exists
    try:
        secretsmanager.get_secret_value(
            SecretId=arn,
            VersionId=token,
            VersionStage="AWSPENDING"
        )
        logger.info("API key version already exists, skipping creation")
        return
    except secretsmanager.exceptions.ResourceNotFoundException:
        pass

    # Generate new API key
    new_api_key = generate_secure_api_key(length=64)

    # Get current secret to preserve any additional fields
    try:
        current_secret = secretsmanager.get_secret_value(
            SecretId=arn,
            VersionStage="AWSCURRENT"
        )

        # Try to parse as JSON
        try:
            secret_dict = json.loads(current_secret['SecretString'])
            secret_dict['apiKey'] = new_api_key
            new_secret_string = json.dumps(secret_dict)
        except json.JSONDecodeError:
            # Plain string secret
            new_secret_string = new_api_key

    except secretsmanager.exceptions.ResourceNotFoundException:
        # No current version, create new
        new_secret_string = json.dumps({'apiKey': new_api_key})

    # Put new secret version
    secretsmanager.put_secret_value(
        SecretId=arn,
        ClientRequestToken=token,
        SecretString=new_secret_string,
        VersionStages=['AWSPENDING']
    )

    logger.info("Successfully created new API key version")


def set_secret(arn: str, token: str) -> None:
    """
    Set the new API key

    For simple API keys, this is a no-op since there's no external
    service to update. Override this function if you need to update
    an external service.
    """
    logger.info(f"Set secret for {arn} - no-op for simple API keys")
    # No action needed for simple API keys
    pass


def test_secret(arn: str, token: str) -> None:
    """
    Test the new API key

    Validates that the new API key meets format requirements.
    """
    logger.info(f"Testing API key for {arn}")

    # Get pending secret
    pending_secret = secretsmanager.get_secret_value(
        SecretId=arn,
        VersionId=token,
        VersionStage="AWSPENDING"
    )

    # Validate the secret
    try:
        secret_dict = json.loads(pending_secret['SecretString'])
        api_key = secret_dict.get('apiKey')
    except json.JSONDecodeError:
        # Plain string secret
        api_key = pending_secret['SecretString']

    if not api_key or len(api_key) < 32:
        raise ValueError("API key is too short or empty")

    logger.info("Successfully validated new API key")


def finish_secret(arn: str, token: str) -> None:
    """
    Finish the rotation by moving AWSCURRENT label
    """
    logger.info(f"Finishing rotation for {arn}")

    # Get metadata about the secret
    metadata = secretsmanager.describe_secret(SecretId=arn)

    # Find current version
    current_version = None
    for version in metadata['VersionIdsToStages']:
        if "AWSCURRENT" in metadata['VersionIdsToStages'][version]:
            if version == token:
                logger.info("New version is already marked as AWSCURRENT")
                return
            current_version = version
            break

    # Move AWSCURRENT stage to new version
    secretsmanager.update_secret_version_stage(
        SecretId=arn,
        VersionStage="AWSCURRENT",
        MoveToVersionId=token,
        RemoveFromVersionId=current_version
    )

    logger.info("Successfully completed rotation")


def generate_secure_api_key(length: int = 64) -> str:
    """
    Generate a cryptographically secure random API key

    Args:
        length: Length of the API key (default 64)

    Returns:
        Secure random API key string
    """
    # Use URL-safe characters
    alphabet = string.ascii_letters + string.digits + '-_'
    api_key = ''.join(secrets.choice(alphabet) for _ in range(length))

    # Add prefix for identification
    return f"aistudio_{api_key}"
