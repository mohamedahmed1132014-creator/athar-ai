import express from "express";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app = express();
const port = Number(process.env.PORT || 3000);
const here = path.dirname(fileURLToPath(import.meta.url));
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
if (!apiKey) console.error("Missing GEMINI_API_KEY in .env");

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use("/api/", rateLimit({
  windowMs: 60_000, limit: 20,
  standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "أسئلة كثيرة بسرعة. انتظر دقيقة ثم حاول." }
}));

app.post("/api/chat", async (req, res) => {
  try {
    if (!apiKey) return res.status(503).json({ error: "الخادم لم يُضف إليه مفتاح Gemini بعد." });
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    if (!message) return res.status(400).json({ error: "اكتب سؤالك أولًا." });
    if (message.length > 2000) return res.status(413).json({ error: "السؤال أطول من الحد المسموح." });
    const safeHistory = history.slice(-10).filter(x =>
      x && ["user", "assistant"].includes(x.role) &&
      typeof x.content === "string" && x.content.length <= 2000
    );
    const contents = [
      ...safeHistory.map(x => ({ role: x.role === "assistant" ? "model" : "user", parts: [{ text: x.content }] })),
      { role: "user", parts: [{ text: message }] }
    ];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "أنت مساعد أَثَر الذكي داخل موقع ثقافي مصري. أجب عن أسئلة المستخدم في مختلف المجالات، وليس التراث فقط. تحدث بالعربية الواضحة وبأسلوب مصري لطيف عندما يكتب المستخدم بالمصرية، وبدّل اللغة إذا طلب. اشرح بما يناسب المتعلم، واهتم بالدقة في التاريخ والتراث. لا تختلق حقائق أو مصادر، وصرّح بعدم التأكد عند الحاجة. لا تدّع تنفيذ إجراءات على جهاز المستخدم. لا تطلب كلمات مرور أو مفاتيح سرية أو بيانات شخصية حساسة. إذا كان السؤال غامضًا فاسأل سؤال توضيح واحدًا." }] },
        contents,
        generationConfig: { maxOutputTokens: 900, temperature: 0.7 }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Gemini API error:", response.status, data?.error?.status || "unknown", data?.error?.message || "");
      if (response.status === 429) return res.status(429).json({ error: "وصلت لحد الاستخدام الحالي في Gemini. انتظر قليلًا ثم حاول مرة أخرى." });
      if (response.status === 400 || response.status === 403) return res.status(response.status).json({ error: "Gemini رفض الطلب. راجع صلاحية المفتاح أو إعدادات Google AI Studio." });
      return res.status(502).json({ error: "تعذر الاتصال بخدمة Gemini حاليًا." });
    }
    const reply = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
    if (!reply) return res.status(502).json({ error: "لم يصل رد نصي من Gemini. حاول بسؤال آخر." });
    res.json({ reply });
  } catch (err) {
    console.error("Server error:", err?.message || "unknown");
    res.status(500).json({ error: "حدث خطأ في الخادم. أعد تشغيله وحاول مرة أخرى." });
  }
});

app.use(express.static(here));
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(here, "index.html"));
});
app.listen(port, () => console.log(`Athar running: http://localhost:${port}`));
