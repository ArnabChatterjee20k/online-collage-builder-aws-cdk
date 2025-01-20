# !/bin/bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
npm run build
npm run deploy:test
# aws s3api list-objects-v2 --bucket infrastack-fororignialimages7c1305f-7fcfb21b --prefix arnab --endpoint-url http://localhost:4566 
# aws s3api head-object --bucket infrastack-fororignialimages7c1305f-313ee922 --key arnab/19a31627 --endpoint-url http://localhost:4566 