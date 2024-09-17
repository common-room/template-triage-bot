// ======================
// === Scheduled jobs ===
// ======================

// External dependencies
const { CronJob } = require("cron");
const { WebClient } = require("@slack/web-api");

const TimeAgo = require("javascript-time-ago");
const en = require("javascript-time-ago/locale/en");
TimeAgo.addDefaultLocale(en);

// Internal dependencies
const triageConfig = require("./../config");
const { AuthedTeam } = require("./db");
const {
  getAllMessagesForPastHours,
  filterAndEnrichMessages,
} = require("./messages");

const onCronTick = async function (reminderConfig) {
  const now = new Date();
  console.log("[cron] [onCronTick] ran " + now.toLocaleString());
  console.log("Reminder config is as follows", reminderConfig);

  // Get all teams
  const teams = await AuthedTeam.find({});

  // Loop through found teams
  for (const i in teams) {
    const team = teams[i]._doc;

    console.log(`Processing team ${team.id}`);

    try {
      // Initialize a Slack Web API WebClient, with the team's token
      const client = new WebClient(team.bot.token);

      // Get a list of the channels the bot is in
      const botsUserConversations = await client.users.conversations({
        exclude_archived: true,
        types: "public_channel",
        limit: 100,
      });

      const botsPublicChannels = botsUserConversations.channels;

      // Loop through all the channels the bot is in
      for (const i in botsPublicChannels) {
        const channel = botsPublicChannels[i];

        // Get all messages from the beginning of time (probably not a good idea)
        const allMessages = await getAllMessagesForPastHours(
          channel.id,
          reminderConfig.hours_to_look_back,
          client
        );

        console.log(
          `\tFound ${allMessages.length} total messages in past ${reminderConfig.hours_to_look_back} hours`
        );

        // Use the enricMessages helper to enrich the messages we have
        const allMessagesEnriched = filterAndEnrichMessages(
          allMessages,
          channel,
          team.bot.id
        );

        // Filter all messages to ones we care about based off of the config
        const messagesFilteredForConfig = allMessagesEnriched.filter((m) => {
          // Look to see if the levels and statuses are any of the ones we care about (per reminderConfig)
          const containsAnySpecifiedLevels = m._levels.some((l) =>
            reminderConfig.report_on_levels.includes(l)
          );
          const containsAnySpecifiedStatuses = m._statuses.some((s) =>
            reminderConfig.report_on_does_not_have_status.includes(s)
          );

          // Return the boolean of if they contain any of the levels and do NOT contain any of the statuses
          return containsAnySpecifiedLevels && !containsAnySpecifiedStatuses;
        });

        console.log(
          `\t${messagesFilteredForConfig.length} messages match the reminderConfig criteria`
        );

        const statusEmojis = reminderConfig.report_on_does_not_have_status.map(
          (s) => triageConfig._.statusToEmoji[s]
        );
        const levelEmojis = reminderConfig.report_on_levels.map(
          (l) => triageConfig._.levelToEmoji[l]
        );

        if (messagesFilteredForConfig.length === 0) {
          await client.chat.postMessage({
            channel: channel.id,
            text:
              `:tada: Nice job, <#${channel.id}>! ` +
              `There are ${
                messagesFilteredForConfig.length
              } messages from the past ${
                reminderConfig.hours_to_look_back / 24
              } days that are ` +
              `tagged with a severity and don't have either ${statusEmojis.join(
                "/"
              )}`,
          });
        } else {
          // Formulate a string with proper grammar depending on the number of messages
          const numMessagesString =
            messagesFilteredForConfig.length === 1
              ? "There is *1 message*"
              : `There are *${messagesFilteredForConfig.length} messages*`;

          // Notify the channel about how many messages are pending
          const parentMsg = await client.chat.postMessage({
            channel: channel.id,
            unfurl_links: true,
            text:
              `:wave: Hi there, <#${channel.id}>. ` +
              `${numMessagesString} from the past ${
                reminderConfig.hours_to_look_back / 24
              } days that are ` +
              `tagged with a severity and don't have either ${statusEmojis.join(
                "/"
              )} that need your attention.`,
          });

          const timeAgo = new TimeAgo("en-US");

          // Create a thread with links to each message
          for await (const message of messagesFilteredForConfig) {
            const url = `${process.env.SLACK_URL}archives/${
              message.channel.id
            }/p${message.ts.replace(".", "")}`;
            const d = new Date(parseFloat(message.ts) * 1000);
            await client.chat.postMessage({
              channel: parentMsg.channel,
              thread_ts: parentMsg.ts,
              text: `<${url}|${timeAgo.format(d)}>`,
            });
          }
        }
      }
    } catch (err) {
      console.error(`ERROR processing ${team.id}...`);
      console.error(err);
    }
  }
};

// This exported function is loaded and executed toward the bottom of app.js
// when run, this function looks at all defined scheduled_reminders in the config js file
// and schedules them! Upon triggering (handled by cron)
const scheduleReminders = function () {
  // get the scheduled_reminders array from the config file
  const scheduledReminders = triageConfig.scheduled_reminders;
  // check to make sure it is neither undefined nor blank
  if (
    typeof scheduledReminders !== "undefined" &&
    scheduledReminders.length > 0
  ) {
    // For each reminder, schedule it based off of the expression value
    // and send the rest of the config to the function (onCronTick) so it knows what to do
    scheduledReminders.forEach((reminderConfig) => {
      new CronJob(
        reminderConfig.expression,
        () => {
          onCronTick(reminderConfig);
        },
        null, // onComplete
        true, // start
        "America/Los_Angeles" // timeZone
      );
    });
  } else {
    console.error("Sorry but there are no scheduled reminders to schedule.");
    console.error("Please add some to config_triage.js and restart yoru app");
  }
};

const manuallyTriggerScheduledJobs = function () {
  console.debug("Manually triggering scheduled jobs");
  triageConfig.scheduled_reminders.forEach((reminderConfig) => {
    onCronTick(reminderConfig);
  });
};

module.exports = {
  scheduleReminders,
  onCronTick,
  manuallyTriggerScheduledJobs,
};
