import { afterEach, describe, expect, it } from "vitest";
import { webhookUrlProblem } from "../src/net";

describe("webhook URL check", () => {
  afterEach(() => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE_URLS;
  });
  it("refuses internal addresses, including ones disguised as IPv6", async () => {
    for (const u of ["https://127.0.0.1/h", "https://10.1.2.3/h", "https://172.20.0.1/h", "https://192.168.1.1/h", "https://169.254.169.254/latest/meta-data/", "https://[::1]/h", "https://[::ffff:127.0.0.1]/h", "https://[fd00::1]/h", "https://0.0.0.0/h"])
      expect(await webhookUrlProblem(u), u).toBe("points to a private or internal address");
  });
  it("requires https and no credentials", async () => {
    expect(await webhookUrlProblem("http://1.1.1.1/h")).toBe("must use https");
    expect(await webhookUrlProblem("https://user:pw@1.1.1.1/h")).toBe("must not contain a username or password");
    expect(await webhookUrlProblem("not a url")).toBe("not a valid URL");
  });
  it("allows public addresses", async () => {
    expect(await webhookUrlProblem("https://1.1.1.1/hook")).toBeNull();
  });
  it("local development can opt in to http and private hosts", async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE_URLS = "true";
    expect(await webhookUrlProblem("http://127.0.0.1:4000/h")).toBeNull();
  });
});
