# !/bin/bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_REGION=us-east-1
export queueURL=http://localhost.localstack.cloud:4566/000000000000/InfraStack-ImageQueue818EB5D7-fd1750d6
export originalImageBucketName=infrastack-fororignialimages7c1305f-7fcfb21b
export transformedImageBucket=infrastack-fortransformedimages69c4-df75acd9
npm run build
node test.js