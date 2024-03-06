import 'dotenv/config';
import express from 'express';
const app = express();
const PORT = process.env.PORT;
const TELEGRAM_BOT_TOKEN = process.env['BOT_TOKEN'];
const OPENAI_API_KEY = process.env['GPT_TOKEN'];

import { Telegraf, session } from 'telegraf';
import OpenAI from 'openai';
import { code } from 'telegraf/format'
import { ogg } from './ogg.js'
import { removeFile } from './utils.js'
import { createReadStream } from 'fs'

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
bot.use(session());

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    organization: 'org-8tGsmHfqLqCpB8sqPsLNCZiO'
});

bot.command('new', initCommand);
bot.command('start', initCommand);

bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    if (userMessage.trim() === '') {
        ctx.reply('Пожалуйста, введите текстовое сообщение.');
    } else {
        const response = await main(userMessage);
        ctx.reply(response.content);
    }
});

bot.on(('voice'), async (ctx) => {
    ctx.session ??= INITIAL_SESSION
    try {
        await ctx.reply(code('Сообщение принято. Жду ответ от сервера...'));
        const link = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const userId = String(ctx.message.from.id);
        const oggPath = await ogg.create(link.href, userId);
        const mp3Path = await ogg.toMp3(oggPath, userId);
        removeFile(oggPath);
        const text = await transcription(mp3Path);
        await ctx.reply(code(`Ваш запрос: ${text}`));
        const answer = await main(text);
        await ctx.reply(answer.content);
        await processTextToChat(ctx, text)
    } catch (e) {
        console.error('Ошибка при обработке голосового сообщения', e.message);
    }
});


async function main(text) {
    const chatCompletion = await openai.chat.completions.create({
        messages: [
            { role: 'system', content: 'Ты личный помощник семьи Громовых' },
            { role: 'assistant', content: text  }
        ],
        model: 'gpt-3.5-turbo',
    });
    if (chatCompletion) {
        return chatCompletion.choices[0].message;
    } else {
        console.error('Invalid response from ChatGPT:', chatCompletion);
        return 'Произошла ошибка при обработке ответа от ChatGPT.';
    }
}


async function transcription(filepath) {
    try {
        const transcription = await openai.audio.transcriptions.create({
            file: createReadStream(filepath),
            model: "whisper-1",
        });
        return transcription.text;
    } catch (e) {
        console.log('Ошибка при транскрибации', e.message);
    }
}

export const INITIAL_SESSION = {
    messages: [],
}
export async function initCommand(ctx) {
    ctx.session = INITIAL_SESSION
    await ctx.reply('Жду вашего голосового или текстового сообщения')
}

export async function processTextToChat(ctx, content) {
    try {
        ctx.session.messages.push({ role: openai.roles.USER, content })
        const response = await openai.chat(ctx.session.messages)
        ctx.session.messages.push({
            role: openai.roles.ASSISTANT,
            content: response.content,
        })
        await ctx.reply(response.content)
    } catch (e) {
        console.log('Error while proccesing text to gpt', e.message)
    }
}

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

app.listen(PORT, () => {
    console.log(`This gpt bot on ${PORT}`);
});
