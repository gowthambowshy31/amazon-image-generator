import { prisma } from '../lib/prisma';

async function main() {
  // Count images with and without S3 paths
  const withS3 = await prisma.sourceImage.count({
    where: { localFilePath: { not: null } }
  });

  const withoutS3 = await prisma.sourceImage.count({
    where: { localFilePath: null }
  });

  const total = withS3 + withoutS3;

  console.log('=== S3 Upload Status ===');
  console.log(`Total source images: ${total}`);
  console.log(`With S3 path: ${withS3} (${((withS3/total)*100).toFixed(1)}%)`);
  console.log(`Missing S3 path: ${withoutS3} (${((withoutS3/total)*100).toFixed(1)}%)`);

  // Sample of images without S3
  if (withoutS3 > 0) {
    const samples = await prisma.sourceImage.findMany({
      where: { localFilePath: null },
      take: 5,
      select: {
        id: true,
        amazonImageUrl: true,
        variant: true,
        product: { select: { asin: true, title: true } }
      }
    });
    console.log('\n=== Sample Images Missing S3 Path ===');
    samples.forEach(img => {
      console.log(`- ${img.product.asin}: ${img.variant} - ${img.amazonImageUrl.substring(0, 60)}...`);
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
