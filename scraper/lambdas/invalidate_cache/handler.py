import boto3
import os
import time

cloudfront = boto3.client("cloudfront", region_name="us-east-1")

DISTRIBUTION_ID = os.environ["CLOUDFRONT_DISTRIBUTION_ID"]


def handler(event, context):
    print(f"Invalidating CloudFront cache for distribution {DISTRIBUTION_ID}...")

    cloudfront.create_invalidation(
        DistributionId=DISTRIBUTION_ID,
        InvalidationBatch={
            "Paths": {
                "Quantity": 1,
                "Items": ["/*"]
            },
            "CallerReference": str(time.time())
        }
    )

    print("Cache invalidation triggered")
    return {"status": "success"}