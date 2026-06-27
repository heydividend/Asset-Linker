import { clerkClient } from "@clerk/express";

async function ensureUser(email, password, firstName, lastName) {
  const existing = await clerkClient.users.getUserList({ emailAddress: [email] });
  const found = (existing?.data ?? existing)[0];
  if (found) {
    await clerkClient.users.updateUser(found.id, {
      password,
      skipPasswordChecks: true,
    });
    return { id: found.id, email, status: "updated-existing" };
  }
  const created = await clerkClient.users.createUser({
    emailAddress: [email],
    password,
    firstName,
    lastName,
    skipPasswordChecks: true,
  });
  return { id: created.id, email, status: "created" };
}

const admin = await ensureUser(
  "mhuddleston@heydividend.com",
  process.env.SEED_ADMIN_PW,
  "M",
  "Huddleston",
);
const student = await ensureUser(
  "jacobhudd13@gmail.com",
  process.env.SEED_STUDENT_PW,
  "Jacob",
  "Huddleston",
);

console.log(JSON.stringify({ admin, student }));
