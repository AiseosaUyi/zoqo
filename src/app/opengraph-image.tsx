import { ImageResponse } from "next/og";

// Image metadata
export const alt = "ZOQO — Trade the next 5 minutes of Bitcoin";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Fetch a Google font as a TTF ArrayBuffer for satori (next/og).
 * The css2 endpoint serves woff2 to modern browsers, which satori can't read,
 * so we send an old User-Agent to force the `truetype` source. `text` scopes
 * the download to only the glyphs we render — keeps it tiny and fast.
 */
async function loadGoogleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    family,
  )}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (
    await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/534.30 (KHTML, like Gecko) Version/5.1 Safari/534.30",
      },
    })
  ).text();
  const src = css.match(
    /src: url\((.+?)\) format\('(?:opentype|truetype|woff)'\)/,
  );
  if (!src) throw new Error(`Failed to load font: ${family}`);
  return (await fetch(src[1])).arrayBuffer();
}

export default async function Image() {
  const WORDMARK = "ZOQO";
  const TAGLINE = "Trade the next 5 minutes of Bitcoin";
  const PRICE = "$67,500";

  const [inter800, inter500, bebas400] = await Promise.all([
    loadGoogleFont("Inter", 800, WORDMARK),
    loadGoogleFont("Inter", 500, TAGLINE),
    loadGoogleFont("Bebas Neue", 400, PRICE),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#16140f", // --color-gray-900 (warm ink)
          fontFamily: "Inter",
          position: "relative",
        }}
      >
        {/* Off-center purple brand glow — the only decoration */}
        <div
          style={{
            position: "absolute",
            top: -220,
            left: -160,
            width: 820,
            height: 820,
            display: "flex",
            background:
              "radial-gradient(circle, rgba(96,31,255,0.50) 0%, rgba(96,31,255,0) 62%)",
          }}
        />

        {/* Wordmark — the hero */}
        <div
          style={{
            display: "flex",
            fontSize: 152,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            color: "#ffffff",
          }}
        >
          {WORDMARK}
        </div>

        {/* Tagline — one line, nothing more */}
        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: 30,
            fontWeight: 500,
            color: "#b0aba1", // --color-gray-400
          }}
        >
          {TAGLINE}
        </div>

        {/* Number motif — Bebas price + green up-tick, in a subtle pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 52,
            padding: "14px 28px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#27ae60"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
          <div
            style={{
              display: "flex",
              fontFamily: "Bebas Neue",
              fontSize: 64,
              letterSpacing: "0.02em",
              color: "#ffffff",
            }}
          >
            {PRICE}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: inter800, style: "normal", weight: 800 },
        { name: "Inter", data: inter500, style: "normal", weight: 500 },
        { name: "Bebas Neue", data: bebas400, style: "normal", weight: 400 },
      ],
    },
  );
}
