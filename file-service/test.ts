import * as dotenv from "dotenv"
dotenv.config()
import { handler } from "./index.js";
(async () => {
    const mockEvent = {
      Records: [
        {
          body: JSON.stringify({
            layout: "horizontal",
            uuid: "arnab",
          }),
          receiptHandle: "mock-receipt-handle", // Dummy value for testing
        },
      ],
    };
    // @ts-ignore
    await handler(mockEvent,null);
  })();