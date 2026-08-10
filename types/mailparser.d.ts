declare module "mailparser" {
  import type { Readable } from "node:stream";

  export type ParsedAddress = {
    text?: string;
    value?: Array<{
      name?: string;
      address?: string;
    }>;
  };

  export type ParsedMail = {
    subject?: string;
    from?: ParsedAddress;
    date?: Date;
    messageId?: string;
    text?: string;
    html?: string | false;
  };

  export function simpleParser(
    input: Buffer | string | Readable
  ): Promise<ParsedMail>;
}

