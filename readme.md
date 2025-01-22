### Collage Builder

A simple app built in a complex way possible.
Can be done in any tech stack but the infra if written in typescript then it would be ease as the aws cdk is itself coded in typescript

> If you want to run it in localstack, remove the cloudfront code as it is not available

### Accessing cloudfront data
Either pass the cf domain to lambdaenv and show return to the user
The domain will be displayed in the cli while deploying
### MOTO

To learn aws cdk and building things in complex way as gpt wrote the collage building code
But the whole design is mine

### Requirements

1. Localstack (I just love this) -> No aws , ho ho ho
2. Node
3. AWS account for caching as localstack don't support in free plan
   ![alt text](collage-infra.png)

### Preventing direct access of user to the s3

We can use Origin Access Control so that only the cached endpoint is hit and direct hit to the s3 is prevented
