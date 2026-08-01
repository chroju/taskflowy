import type { FC, PropsWithChildren } from "hono/jsx";

export const BaseLayout: FC<PropsWithChildren<{ title?: string }>> = ({ children, title }) => (
  <html lang="ja">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <meta name="theme-color" content="#24273a" />
      <title>{title || "Taskflowy"}</title>
      <link rel="manifest" href="/manifest.json" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="apple-touch-icon" href="/icon-192.png" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600&display=swap"
      />
      <link rel="stylesheet" href="/styles/main.css" />
    </head>
    <body>
      {children}
      <script src="/scripts/client.js" type="module"></script>
    </body>
  </html>
);
