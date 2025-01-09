// Устанавливаем необходимые библиотеки
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config();

// Константы для Twitch API
const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// Константы для Telegram API
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let ACCESS_TOKEN = '';
const isStreaming = new Map(); // Для отслеживания статуса каждого стримера

// Функция для отправки сообщения в Telegram
async function sendTelegramMessage(chatId, message, options = {}) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: message,
            ...options,
        });
        console.log('Сообщение отправлено в Telegram:', message);
    } catch (error) {
        console.error('Ошибка при отправке сообщения в Telegram:', error.message);
    }
}

// Функция для получения токена доступа
async function getAccessToken() {
    const response = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials',
        },
    });
    ACCESS_TOKEN = response.data.access_token;
}

// Функция для проверки статуса стримеров
async function checkStreamersStatus() {
    try {
        const streamers = fs
            .readFileSync('streamers.txt', 'utf8')
            .split('\n')
            .map(name => name.trim())
            .filter(name => name);

        console.log('Список стримеров для проверки:', streamers);

        for (const streamer of streamers) {
            console.log('Проверяем стримера:', streamer);

            const userResponse = await axios.get(`https://api.twitch.tv/helix/users`, {
                headers: {
                    'Client-ID': CLIENT_ID,
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
                params: {
                    login: streamer,
                },
            });

            if (userResponse.data.data.length === 0) {
                console.log(`Стример ${streamer} не найден.`);
                continue;
            }

            const userId = userResponse.data.data[0].id;

            const streamResponse = await axios.get(`https://api.twitch.tv/helix/streams`, {
                headers: {
                    'Client-ID': CLIENT_ID,
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                },
                params: {
                    user_id: userId,
                },
            });

            const isLive = streamResponse.data.data.length > 0;

            if (isLive && !isStreaming.get(streamer)) {
                const streamData = streamResponse.data.data[0];
                const title = streamData.title;
                const url = `https://www.twitch.tv/${streamer}`;

                const message = `${streamer} начал стрим!\n\n🎥 ${title}\n🔗 (${url})`;
                console.log(message);

                await sendTelegramMessage(TELEGRAM_CHAT_ID, message);
                isStreaming.set(streamer, true);
            } else if (!isLive && isStreaming.get(streamer)) {
                console.log(`${streamer} не стримит.`);
                isStreaming.set(streamer, false);
            }
        }
    } catch (error) {
        console.error('Ошибка при проверке статуса стримеров:', error.message);
        if (error.response && error.response.status === 401) {
            console.log('Токен доступа устарел. Обновляем токен...');
            await getAccessToken();
        }
    }
}

// Функция для обработки Telegram-команд
async function handleTelegramUpdates() {
    let offset = 0;

    setInterval(async () => {
        try {
            const response = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`, {
                params: { offset },
            });

            const updates = response.data.result;

            for (const update of updates) {
                offset = update.update_id + 1;

                const chatId = update.message.chat.id;
                const text = update.message.text;

                if (text === '/start') {
                    // Отправляем приветственное сообщение с клавиатурой
                    await sendTelegramMessage(chatId, 'Привет! Используй кнопку ниже для отображения активных стримеров.', {
                        reply_markup: {
                            keyboard: [
                                [{ text: 'Активные стримеры' }],
                            ],
                            resize_keyboard: true,
                            one_time_keyboard: true,
                        },
                    });
                } else if (text === 'Активные стримеры') {
                    // Формируем список активных стримеров
                    const activeStreamers = Array.from(isStreaming.entries())
                        .filter(([_, live]) => live)
                        .map(([streamer]) => `🎥 ${streamer}`)
                        .join('\n');

                    const message = activeStreamers.length > 0
                        ? `Сейчас стримят:\n\n${activeStreamers}`
                        : 'Нет активных стримеров.';

                    await sendTelegramMessage(chatId, message);
                }
            }
        } catch (error) {
            console.error('Ошибка при обработке Telegram-обновлений:', error.message);
        }
    }, 1000); // Проверяем обновления каждые 1 секунду
}

// Основной процесс
(async () => {
    await getAccessToken();
    console.log('Бот запущен. Отслеживаем статус стримеров.');

    // Запускаем обработку Telegram-команд
    handleTelegramUpdates();

    // Проверяем статус стримеров каждые 5 секунд
    setInterval(checkStreamersStatus, 5000);
})();
