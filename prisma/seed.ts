/**
 * ---------------------------------------------------------------------------
 * ClassHub development seed
 *
 * Run with:  npm run seed        (from the project root)
 *
 * Creates a realistic classroom: one admin, several demo students, and a
 * couple of published resources (a quiz and an assignment) each carrying a
 * question, an answer and a last date.
 *
 * These credentials are for LOCAL DEVELOPMENT ONLY. They are intentionally weak
 * so they are easy to type while testing, and they must never be reused in any
 * deployed environment. See README.md > Demo credentials.
 * ---------------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEnv = path.resolve(__dirname, '..', 'server', '.env');
if (fs.existsSync(serverEnv)) dotenv.config({ path: serverEnv });

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Password123';
const ADMIN_PASSWORD = 'Admin@12345';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function main() {
  console.log('\n[seed] ClassHub development data\n');

  // --- Clean slate (children before parents) -------------------------------
  await prisma.$transaction([
    prisma.deadlineReminder.deleteMany(),
    prisma.emailLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.resource.deleteMany(),
  ]);
  console.log('  cleared existing resources, notifications and reminders');

  // --- Admin ----------------------------------------------------------------
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@classhub.edu' },
    update: { name: 'Dr. Sarah Mitchell', passwordHash: adminPasswordHash, isActive: true },
    create: {
      email: 'admin@classhub.edu',
      name: 'Dr. Sarah Mitchell',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log(`  admin      ${admin.email}`);

  // --- Students -------------------------------------------------------------
  const studentPasswordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const studentSeeds = [
    { name: 'Jasim Ahmed',    email: 'jasim@student.classhub.edu',  studentCode: 'CSE-2026-001' },
    { name: 'Priya Sharma',   email: 'priya@student.classhub.edu', studentCode: 'CSE-2026-002' },
    { name: 'Daniel Okafor',  email: 'daniel@student.classhub.edu', studentCode: 'CSE-2026-003' },
    { name: 'Mei Lin Chen',   email: 'mei@student.classhub.edu',   studentCode: 'CSE-2026-004' },
    { name: 'Lucas Ferreira', email: 'lucas@student.classhub.edu',  studentCode: 'CSE-2026-005' },
  ];

  const students = [];
  for (const seed of studentSeeds) {
    students.push(
      await prisma.user.upsert({
        where: { email: seed.email },
        update: { name: seed.name, passwordHash: studentPasswordHash, isActive: true },
        create: { ...seed, passwordHash: studentPasswordHash, role: 'STUDENT', isActive: true },
      }),
    );
  }
  console.log(`  students   ${students.length} created`);

  // --- Published quiz -------------------------------------------------------
  // Last date 3 days out, so the 24h reminder is not yet due.
  const quiz = await prisma.resource.create({
    data: {
      type: 'QUIZ',
      title: 'Database Management - Mid-Term Quiz',
      description:
        'Revision material for the mid-term. Work through the questions, then check yourself against the model answers.',
      questionText: `1. Which normal form guarantees that every non-key attribute is fully functionally dependent on the primary key?

2. An index on a frequently filtered but rarely updated column is usually best implemented as which index type?

3. Under which isolation level can a transaction read data that another uncommitted transaction is writing?

4. What does the ACID property "A" stand for in a database transaction?

5. Which SQL clause removes duplicate rows from a result set?`,
      answerText: `1. B - Second Normal Form (2NF)
   2NF removes partial dependency on a composite key.

2. A - B-Tree index
   Balanced tree structure keeps lookups logarithmic as the table grows.

3. A - Read Uncommitted
   This is precisely the dirty-read behaviour, and is the reason it is rarely used.

4. B - Atomicity
   All statements in the transaction succeed, or none do.

5. C - DISTINCT
   GROUP BY aggregates instead, which is a different operation.`,
      lastDate: new Date(Date.now() + 3 * DAY),
      isPublished: true,
      createdById: admin.id,
    },
  });
  console.log(`  resource   "${quiz.title}" (QUIZ, published)`);

  // --- Published assignment -------------------------------------------------
  const assignment = await prisma.resource.create({
    data: {
      type: 'ASSIGNMENT',
      title: 'Database Management Assignment 2',
      description:
        'Reference answers and marking guidance for the online-bookstore schema design.',
      questionText: `1. Design an ER diagram covering Books, Authors, Publishers, Customers and Orders.

2. Normalise your design to at least Third Normal Form and justify each step.

3. Write the SQL DDL to create the tables, including primary keys and at least three foreign key constraints.

4. Implement a query that returns the top 5 best-selling books for the last quarter.

5. Submit a single PDF document. Include your ER diagram as an image.

Page limit: 8 pages.`,
      answerText: `A strong answer looks like this:

1. Five entities plus a many-to-many Orders_Items join table to resolve the
   book/order relationship.

2. 1NF: remove repeating groups - move order lines into their own table.
   2NF: Orders_Items has a composite key, so move quantity into it rather than
        depending on order_id alone.
   3NF: Publisher address depends on publisher, not on book - so it lives in
        Publishers, not Books.

3. Use InnoDB, declare explicit PRIMARY KEYs, and add INDEX (author_id) and
   INDEX (publisher_id) alongside the FOREIGN KEY constraints.

4. SELECT b.title, SUM(oi.quantity) AS sold
   FROM books b
   JOIN order_items oi ON oi.book_id = b.id
   JOIN orders o ON o.id = oi.order_id
   WHERE o.placed_at >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
   GROUP BY b.id, b.title
   ORDER BY sold DESC
   LIMIT 5;

5. Marks are awarded for normalisation quality and query correctness. Partial
   credit is available at each numbered step.`,
      lastDate: new Date(Date.now() + 5 * DAY),
      isPublished: true,
      createdById: admin.id,
    },
  });
  console.log(`  resource   "${assignment.title}" (ASSIGNMENT, published)`);

  // --- A draft, so the admin UI has a non-published example ------------------
  const draft = await prisma.resource.create({
    data: {
      type: 'QUIZ',
      title: 'Operating Systems - Draft (not published)',
      description: 'Still being written. Visible to admins only.',
      questionText: '1. Which CPU scheduling algorithm can cause starvation?\n2. Differentiate a process from a thread.',
      answerText: '1. D - Priority Scheduling\n   Low-priority processes can be starved indefinitely by a steady stream of high-priority work.\n\n2. A process owns its address space; threads share one.',
      lastDate: new Date(Date.now() + 7 * DAY),
      isPublished: false,
      createdById: admin.id,
    },
  });
  console.log(`  resource   "${draft.title}" (draft)`);

  // --- Announce the published material --------------------------------------
  await prisma.notification.createMany({
    data: [
      ...students.map((student) => ({
        userId: student.id,
        type: 'DEADLINE_UPCOMING' as const,
        title: `New quiz available: ${quiz.title}`,
        message: `The question and model answers are ready. Last date: ${quiz.lastDate.toDateString()}.`,
        link: `/student/resources/${quiz.id}`,
        resourceId: quiz.id,
      })),
      ...students.map((student) => ({
        userId: student.id,
        type: 'DEADLINE_UPCOMING' as const,
        title: `New assignment available: ${assignment.title}`,
        message: `The question and reference answers are ready. Last date: ${assignment.lastDate.toDateString()}.`,
        link: `/student/resources/${assignment.id}`,
        resourceId: assignment.id,
      })),
    ],
  });
  console.log('  notifications seeded for every student');

  console.log('\n  ----------------------------------------------------------');
  console.log('  DEMO CREDENTIALS (local development only)');
  console.log('  ----------------------------------------------------------');
  console.log('  Admin    admin@classhub.edu        / Admin@12345');
  console.log(`  Students ${DEMO_PASSWORD} (shared, e.g. jasim@student.classhub.edu)`);
  console.log('  ----------------------------------------------------------\n');
}

main()
  .catch((error) => {
    console.error('[seed] failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
