import { createHmac } from "node:crypto";
export const signPayload = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("hex");
