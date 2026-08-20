const triageConfig = {
  statuses: {
    Acknowledged: {
      emoji: ":eyes:",
    },
    Done: {
      emoji: ":white_check_mark:",
    },
    Accepted: {
      emoji: ":thumbsup_all:",
    },
  },
  levels: {
    P0: {
      emoji: ":red_p0:",
    },
    P1: {
      emoji: ":orange_p1:",
    },
    P2: {
      emoji: ":yellow_p2:",
    },
    P3: {
      emoji: ":blue_p3:",
    },
  },
  scheduled_reminders: [
    {
      expression: "0 9 * * 1-5",
      hours_to_look_back: 168,
      report_on_levels: ["P0", "P1", "P2", "P3"], // only report on messages with one of these levels ("OR" logic)
      report_on_does_not_have_status: ["Acknowledged", "Done"], // only report on messages that do not have either of these statuses ("OR")
    },
  ],
};

// !!! You should not need to edit anything below this comment !!!

// Load our internal triage config helper
const { generateTriageConfigLookups } = require("./helpers/misc");

// Create some calculated arrays/lookups based off of our triageConfig
triageConfig._ = generateTriageConfigLookups(triageConfig);

// Export the config and the generated lookups
module.exports = triageConfig;
