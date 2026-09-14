import { connect } from "cloudflare:sockets";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** HTTP GET over TLS socket — avoids Worker `fetch()` headers that DOU/Cloudflare WAF 403s. */
export async function fetchUrlViaTlsSocket(urlString: string): Promise<{ status: number; body: string }> {
  const url = new URL(urlString);
  const socket = connect(
    { hostname: url.hostname, port: 443 },
    { secureTransport: "on" },
  );

  const writer = socket.writable.getWriter();
  const path = `${url.pathname}${url.search}`;
  const request =
    `GET ${path} HTTP/1.1\r\n` +
    `Host: ${url.hostname}\r\n` +
    `User-Agent: ${USER_AGENT}\r\n` +
    `Accept: application/rss+xml, application/xml, text/xml, */*\r\n` +
    `Accept-Language: uk-UA,uk;q=0.9,en;q=0.8\r\n` +
    `Connection: close\r\n\r\n`;

  await writer.write(new TextEncoder().encode(request));
  await writer.close();

  const reader = socket.readable.getReader();
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
    socket.close();
  }

  const raw = new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks));
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    throw new Error("socket HTTP: no header terminator");
  }
  const headerBlock = raw.slice(0, headerEnd);
  const body = raw.slice(headerEnd + 4);
  const statusMatch = headerBlock.match(/^HTTP\/\d(?:\.\d)? (\d+)/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  return { status, body };
}
