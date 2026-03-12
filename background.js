const enc = new TextEncoder();
const SEARCH = enc.encode('"rweb_age_assurance_flow_enabled":{"value":true}');
const REPLACE = enc.encode('"rweb_age_assurance_flow_enabled":{"value":false}');
const OVERLAP = SEARCH.length - 1;

function byteReplaceAll(data) {
  const positions = [];
  outer: for (let i = 0; i <= data.length - SEARCH.length; i++) {
    for (let j = 0; j < SEARCH.length; j++) {
      if (data[i + j] !== SEARCH[j]) continue outer;
    }
    positions.push(i);
    i += SEARCH.length - 1;
  }
  if (positions.length === 0) return data;
  const result = new Uint8Array(data.length + positions.length * (REPLACE.length - SEARCH.length));
  let si = 0;
  let di = 0;
  for (const pos of positions) {
    result.set(data.subarray(si, pos), di);
    di += pos - si;
    result.set(REPLACE, di);
    di += REPLACE.length;
    si = pos + SEARCH.length;
  }
  result.set(data.subarray(si), di);
  return result;
}

function patch({ requestId }) {
  const filter = browser.webRequest.filterResponseData(requestId);
  const carry = new Uint8Array(OVERLAP);
  let carryLen = 0;

  filter.ondata = (event) => {
    const chunk = new Uint8Array(event.data);
    const combined = new Uint8Array(carryLen + chunk.length);
    combined.set(carry.subarray(0, carryLen));
    combined.set(chunk, carryLen);

    const replaced = byteReplaceAll(combined);
    const safeEnd = replaced.length - OVERLAP;
    if (safeEnd > 0) {
      filter.write(replaced.slice(0, safeEnd).buffer);
      carry.set(replaced.subarray(safeEnd));
      carryLen = OVERLAP;
    } else {
      carry.set(replaced);
      carryLen = replaced.length;
    }
  };

  filter.onstop = () => {
    if (carryLen > 0) {
      const final = byteReplaceAll(carry.subarray(0, carryLen));
      filter.write(final.buffer);
    }
    filter.close();
  };
}

function isHtmlResponse(responseHeaders = []) {
  return responseHeaders.some((header) => {
    if (!header?.name) return false;
    if (header.name.toLowerCase() !== "content-type") return false;

    const value = (header.value || "").toLowerCase();
    return value.includes("text/html") || value.includes("application/xhtml+xml");
  });
}

function maybePatch(details) {
  if (isHtmlResponse(details.responseHeaders)) {
    patch(details);
  }
}

browser.webRequest.onHeadersReceived.addListener(
  maybePatch,
  {
    urls: ["*://x.com/*"],
    types: ["main_frame", "sub_frame"],
  },
  ["blocking", "responseHeaders"],
);
