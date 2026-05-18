import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are an AI assistant embedded in the Bill Morrisons Financial Consulting dashboard in Malaysia. You assist the consultant (Bill Morrisons) with client data, financial analysis, and document generation.

Current client data (Ahmad Rizal bin Abdullah):
- Age: 41, Target retirement age: 60 (19 years remaining)
- Risk profile: Moderate, Segment: Affluent
- AUM: RM 250,000
- Monthly income: RM 12,000, Monthly surplus: RM 4,680 (39% savings rate)
- Financial goals: Retirement and Property
- Portfolio: EPF Account 1 RM 115,000 (+28%), Public Mutual Growth Fund RM 85,000 (+21%), Maybank FD 12-month RM 50,000 (matures Nov 2026)
- Urgent items: No insurance coverage on file, FD reinvestment needed Nov 2026, retirement gap RM 374,230
- Next review: August 16, 2026

Give concise, practical, Malaysia-specific advice. Use RM for currency. Be direct and professional. Max 300 words unless asked for more detail. Use BM terms where appropriate (KWSP, OPR, PDPA).`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not set in environment variables.' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    // Convert message history for Gemini (role must be 'user' or 'model')
    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);
    const content = result.response.text();

    return NextResponse.json({ content });
  } catch (error) {
    console.error('Gemini API error:', error);
    return NextResponse.json({ error: 'AI service error. Check GEMINI_API_KEY.' }, { status: 500 });
  }
}
