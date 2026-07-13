const fs = require('fs');
const path = require('path');
const schemaPath = path.join(__dirname, '..', 'prisma', 'schema.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');
const attendanceRegex = /model Attendance \{[\s\S]*?@@map\("attendance"\)\n\}/m;
const replacement = `model Attendance {
  id            String           @id @map("id")
  guardId       String           @map("guardId")
  guard         Guard            @relation(fields: [guardId], references: [id])
  siteId        String           @map("siteId")
  site          Site             @relation(fields: [siteId], references: [id])
  date          DateTime         @map("date")
  checkIn       DateTime?        @map("checkIn")
  checkOut      DateTime?        @map("checkOut")
  hoursWorked   Decimal          @db.Decimal(6,2) @default(0) @map("hoursWorked")
  overtimeHours Decimal          @db.Decimal(6,2) @default(0) @map("overtimeHours")
  status        AttendanceStatus @default(PRESENT) @map("status")
  notes         String?          @map("notes")
  createdAt     DateTime         @default(now()) @map("createdAt")
  updatedAt     DateTime         @default(now()) @map("updatedAt")

  @@unique([guardId, date], name: "guardId_date")
  @@index([guardId])
  @@index([siteId])
  @@index([date])
  @@map("attendance")
}`;

if (!attendanceRegex.test(schema)) {
  console.error('Attendance model block not found in prisma/schema.prisma');
  process.exit(1);
}

schema = schema.replace(attendanceRegex, replacement);
fs.writeFileSync(schemaPath, schema, 'utf8');
console.log('Updated Attendance model in prisma/schema.prisma');
