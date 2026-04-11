import { initializeApp } from "./bootstrap";
import { log } from "./logger";

void initializeApp()
  .then(({ httpServer }) => {
    if (process.env.VERCEL) {
      return;
    }

    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`serving on port ${port}`);
      },
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
