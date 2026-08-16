import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.sale.groupBy({
    by: ['customerId'],
    where: { paymentStatus: 'DUE', customerId: { not: null } },
    _sum: { dueAmount: true },
  });

  for (const row of rows) {
    const dueSum = Math.round((row._sum.dueAmount || 0) * 100) / 100;
    if (dueSum <= 0) continue;
    await prisma.customer.update({
      where: { id: row.customerId as number },
      data: { creditBalance: dueSum },
    });
    console.log(`customer ${row.customerId} -> creditBalance = ${dueSum}`);
  }

  const others = await prisma.customer.count({
    where: { creditBalance: { not: 0 } },
  });
  console.log(`Done. ${rows.length} customers updated. ${others} customers still have a non-zero credit balance.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
