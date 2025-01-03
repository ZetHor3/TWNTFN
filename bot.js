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
async function sendTelegramMessage(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
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

async function checkStreamersStatus() {
    try {
        // Читаем список стримеров из файла
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
                const title = streamData.title; // Заголовок стрима
                const url = `https://www.twitch.tv/${streamer}`; // Ссылка на стрим

                const message = `${streamer} начал стрим!\n\n🎥 ${title}\n🔗 (${url})`;
                console.log(message);

                await sendTelegramMessage(message); // Отправляем сообщение с заголовком и ссылкой
                isStreaming.set(streamer, true);
            } else if (!isLive && isStreaming.get(streamer)) {
                console.log(`${streamer} не стримит.`);
                isStreaming.set(streamer, false); // Обновляем статус без отправки сообщения
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


// Основной процесс
(async () => {
    await getAccessToken();
    console.log('Бот запущен. Отслеживаем статус стримеров.');

    // Проверяем статус стримеров каждые 5 секунд
    setInterval(checkStreamersStatus, 5000);
})();
