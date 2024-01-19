import { SlashCommandSubcommandBuilder } from "discord.js";
import { blockQuote, bold } from "discord.js";
import { SubCommand } from "@_types/commands";
import { ENV } from "@env";
import { Gradients } from "@util/color";
import chalk from "chalk";
import axios from "axios";

interface PostSolutionResponse {
  message?: string;
  data?: { time: number };
  error?: string;
}

export default {
  isSubCommand: true,
  command: new SlashCommandSubcommandBuilder()
    .setName("submit")
    .setDescription("Submits a solution to the server")
    .addStringOption((opt) => opt.setName("repo_url").setDescription("repo_url").setRequired(true))
    .addIntegerOption((opt) => opt.setName("day").setDescription("day").setRequired(true))
    .addIntegerOption((opt) => opt.setName("part").setDescription("part").setRequired(true)),
  async execute(_, interaction) {
    if (!interaction.isChatInputCommand()) return;
    const solutionInfo = {
      author: interaction.user.id,
      repo_url: interaction.options.get("repo_url", true).value,
      day: interaction.options.get("day", true).value?.valueOf(),
      part: interaction.options.get("part", true).value?.valueOf(),
    };

    await interaction.deferReply({ ephemeral: true });
    try {
      const res = await axios.post(`${ENV.BS_BASE_URL}/aoc/solution`, solutionInfo, {
        headers: {
          "CF-Access-Client-Id": ENV.BS_ACCESS_CLIENT_ID,
          "CF-Access-Client-Secret": ENV.BS_ACCESS_CLIENT_SECRET,
        },
        responseType: "stream",
      });

      const [checkmark, arrow, eq] = [chalk.green("✔"), chalk.blue("|>"), chalk.cyan("|=")];
      const reply: string[] = [];
      let timeoutId: NodeJS.Timeout;
      let streamEnded = false;

      res.data.on("data", async (chunk: Buffer) => {
        if (!chunk.toString().trim()) return;
        const { error, message, data }: PostSolutionResponse = JSON.parse(chunk.toString().trim());

        if (error) throw new Error(error);

        if (reply.length >= 1) reply.push(`${reply.pop()} ${checkmark}`);
        if (message) reply.push(`${arrow} ${message.replace(/\.+/, "")}`);

        clearTimeout(timeoutId);
        if (data) {
          reply.push(`${eq} A solução executou em: ${chalk.green(data.time)} ms`);
          const content = `Solução enviada ✔\`\`\`ansi\n${reply.join("\n")}\`\`\``;
          return await interaction.editReply(blockQuote(bold(content)));
        }

        // prettier-ignore
        setImmediate(async function sendReply(elipsisPhase: number, initialTime: number) {
            const elipsis = Gradients.christmas(".".repeat(elipsisPhase % 4).padEnd(3));
            const elapsedTime = process.hrtime()[0] - initialTime;
            const content = `Enviando solução... \`\`\`ansi\n${reply.join("\n")} ${elipsis} ${elapsedTime}s\`\`\``;
            
            await interaction.editReply(blockQuote(bold(content)));

            if (!streamEnded) {
              clearTimeout(timeoutId);
              timeoutId = setTimeout(sendReply, 333, elipsisPhase + 1, initialTime);
            }
          }, 
          0, process.hrtime()[0]
        );
      });

      streamEnded = await new Promise((resolve) => res.data.on("end", () => resolve(true)));
    } catch (e) {
      await interaction.editReply(JSON.stringify(e, null, 4));
    }
  },
} as SubCommand;
