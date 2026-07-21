import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

// Simple request logger
app.use((req: Request, res: Response, next: NextFunction) => {
  res.on("finish", () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url?.split("?")[0]} → ${res.statusCode}`);
  });
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
