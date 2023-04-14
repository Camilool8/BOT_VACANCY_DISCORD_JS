const cron = require("node-cron");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const prompt = require("prompt-sync")({ sigint: true });
const dotenv = require("dotenv");
const { Client, IntentsBitField } = require("discord.js");
const fs = require("fs");
const { all } = require("axios");

dotenv.config();

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.STRING_SESSION);
const botKey = process.env.BOT_KEY;

function toDate(unixTimestamp) {
  const date = new Date(unixTimestamp * 1000);
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();
  let hours = date.getHours();
  let minutes = date.getMinutes();
  let seconds = date.getSeconds();

  if (month < 10) {
    month = "0" + month;
  }
  if (day < 10) {
    day = "0" + day;
  }
  if (hours < 10) {
    hours = "0" + hours;
  }
  if (minutes < 10) {
    minutes = "0" + minutes;
  }
  if (seconds < 10) {
    seconds = "0" + seconds;
  }
  return `${year}-${month}-${day}/${hours}:${minutes}:${seconds}`;
}

function filterMessagesOlderThan(messages, date, time) {
  let filteredMessages = [];
  for (let i = 0; i < messages.length; i++) {
    let message = messages[i].split(" ");
    let messageDate = message[0];
    let messageTime = message[1];
    if (messageDate > date || (messageDate == date && messageTime > time)) {
      filteredMessages.push(messages[i]);
    }
  }
  return filteredMessages;
}

cron.schedule("0 22 * * *", () => {
(async () => {
  console.log("Loading interactive example...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.start({
    phoneNumber: () => {
      return prompt("Please enter your phone number: ");
    },
    password: () => {
      return prompt("Please enter your password: ", { echo: "*" });
    },
    phoneCode: () => {
      return prompt("Please enter the code you received: ");
    },
  });

  let me = await client.getMe();
  let channel = "https://t.me/vacantes_ti_rd";

  if (channel.startsWith("@")) {
    channel = await client.getInputEntity(channel);
  } else {
    channel = await client.getEntity(channel);
  }

  let offsetId = 0;
  let limit = 100;
  let allMessages = [];
  let totalMessages = 0;
  let total_count_limit = 0;

  while (true) {
    console.log(
      "Current offset ID is:",
      offsetId,
      "; Total messages:",
      totalMessages
    );
    let history = await client.getMessages(channel, {
      limit: limit,
      offsetId: offsetId,
      maxId: 0,
      minId: 0,
      addOffset: 0,
      hash: 0,
    });
    if (!history.length) {
      break;
    }
    let messages = history.map((x) => x.message);
    let dates = history.map((x) => x.date);

    // dates from unix timestamp to date
    dates = dates.map((x) => toDate(x));
    let times = dates.map((x) => x.split("/")[1]);
    dates = dates.map((x) => x.split("/")[0]);

    // combine date and time
    messages = messages.map((x, i) => `${dates[i]} ${times[i]} ${x}`);
    allMessages = allMessages.concat(messages);
    offsetId = history[history.length - 1].id;
    totalMessages += history.length;
    if (total_count_limit != 0 && totalMessages >= total_count_limit) {
      break;
    }

    // Save the session every 100 messages
    if (totalMessages % 100 === 0) {
      console.log("Saving session...");
      fs.writeFileSync(
        "./.env",
        `API_ID=${apiId}\nAPI_HASH=${apiHash}\nSTRING_SESSION=${client.session.save()}\nBOT_KEY=${botKey}\nCHANNEL_ID=${
          process.env.CHANNEL_ID
        }`
      );
    }
  }

  // dump the messages into a file
  fs.writeFileSync("./messages.json", JSON.stringify(allMessages, null, 2));

  // verify if dates.json exists and filter messages
  if (fs.existsSync("./dates.json")) {
    let dates = JSON.parse(fs.readFileSync("./dates.json"));
    let newestDate = dates.newestDate;
    let newestTime = dates.newestTime;
    allMessages = filterMessagesOlderThan(allMessages, newestDate, newestTime);
  }

  // get the newest message date and time
  if (allMessages.length == 0) {
    allMessages = [];
  } else {
    let newestMessage = allMessages[0].split(" ");
    let newestDate = newestMessage[0];
    let newestTime = newestMessage[1];

    fs.writeFileSync(
      "./dates.json",
      JSON.stringify({ newestDate, newestTime }, null, 2)
    );
  }

  // discord bot

  const bot = new Client({
    intents: [
      IntentsBitField.Flags.GuildMessages,
      IntentsBitField.Flags.Guilds,
      IntentsBitField.Flags.MessageContent,
    ],
  });

  bot.on("ready", () => {
    console.log("Bot is ready!");
    let Vacantes = [];
    if (allMessages.length == 0) {
      bot.channels.cache
        .get(process.env.CHANNEL_ID)
        .send("**No han habido vacantes nuevas recientemente :(**");
    } else {
      bot.channels.cache
        .get(process.env.CHANNEL_ID)
        .send("**Estas son las vacantes de tecnologia del dia de hoy:**");
      for (let i = 0; i < allMessages.length; i++) {
        Vacantes.push(allMessages[i].split(" ").slice(2).join(" "));
      }

      Vacantes.forEach((vacante) => {
        bot.channels.cache
          .get(process.env.CHANNEL_ID)
          .send(
            vacante +
              "\n" +
              "--------------------------------------------------------------------------------------------"
          );
      });

      bot.channels.cache
        .get(process.env.CHANNEL_ID)
        .send(
          "**Estas han sido las vacantes de tecnologia mas recientes, buenas noches ;)**"
        );
    }
  });

  bot.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.channel.id !== process.env.CHANNEL_ID) return;
    if (message.content.startsWith("/")) return;

    if (message.content === "!ping") {
      message.reply("Pong!");
    }

    if (message.content === "!vacantes") {
      await message.channel.sendTyping();
      message.reply("https://t.me/vacantes_ti_rd");
    }
  });
  bot.login(botKey);
})();
});
