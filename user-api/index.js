"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const crypto = __importStar(require("crypto"));
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const s3Client = new client_s3_1.S3Client();
const S3_ORIGINAL_IMAGE_BUCKET = process.env.originalImageBucketName;
const S3_TRANSFORMED_IMAGE_BUCKET = process.env
    .transformedImageBucket;
const handler = (event) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const method = event.httpMethod;
        const uuid = (_a = event.pathParameters) === null || _a === void 0 ? void 0 : _a.uuid;
        if (!uuid)
            return { statusCode: 400, message: "Required uuid" };
        if (method === "GET") {
            console.info(`Received uuid ${uuid}`);
            const listParams = {
                Bucket: S3_TRANSFORMED_IMAGE_BUCKET,
                Key: uuid,
            };
            const is_file = yield fileExists(listParams);
            if (!is_file)
                return getResponse(404, { message: "file does not exists" });
            const getCommand = new client_s3_1.GetObjectCommand(listParams);
            const url = yield (0, s3_request_presigner_1.getSignedUrl)(s3Client, getCommand, { expiresIn: 3600 });
            return getResponse(200, { url, is_file });
        }
        // for getting url to upload
        if (method === "PUT") {
            const uploadParams = {
                Bucket: S3_ORIGINAL_IMAGE_BUCKET,
                Key: `${uuid}/${crypto.randomUUID().split("-")[0]}`,
            };
            // TODO: validate the payload
            const putCommand = new client_s3_1.PutObjectCommand(uploadParams);
            const url = yield (0, s3_request_presigner_1.getSignedUrl)(s3Client, putCommand, { expiresIn: 3600 });
            return getResponse(200, { url });
        }
    }
    catch (error) {
        console.error("Error handling request:", error);
    }
});
exports.handler = handler;
function getResponse(statusCode, data) {
    return {
        statusCode: statusCode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
    };
}
function fileExists(listParams) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            console.info("Sending HeadObjectCommand with params:", listParams);
            const headCommand = new client_s3_1.HeadObjectCommand(listParams);
            const data = yield s3Client.send(headCommand);
            console.info("HeadObjectCommand result:", data);
            return true;
        }
        catch (error) {
            if (error.name === "NotFound" || ((_a = error.$metadata) === null || _a === void 0 ? void 0 : _a.httpStatusCode) === 404) {
                console.warn("File not found:", listParams.Key);
            }
            else {
                console.error("Error during file existence check:", error);
            }
            return false;
        }
    });
}
