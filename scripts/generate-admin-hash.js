const crypto = require("crypto");
const readline = require("readline");

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("Mot de passe admin a hacher: ", (password) => {
  const value = String(password || "").trim();

  if (!value) {
    console.error("Mot de passe vide.");
    rl.close();
    process.exit(1);
  }

  console.log("\nCopie cette valeur dans Railway :");
  console.log(`ADMIN_PASSWORD_HASH=${hashPassword(value)}`);
  rl.close();
});
