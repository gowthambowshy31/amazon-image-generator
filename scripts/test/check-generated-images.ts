import { prisma } from '../lib/prisma';

async function main() {
  const count = await prisma.generatedImage.count();
  console.log('Total generated images:', count);

  if (count > 0) {
    const images = await prisma.generatedImage.findMany({
      take: 10,
      select: {
        id: true,
        fileName: true,
        filePath: true,
        status: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log('\nRecent generated images:');
    images.forEach((img, i) => {
      const isS3 = img.filePath && img.filePath.includes('s3.');
      console.log((i + 1) + '. ' + img.status);
      console.log('   File: ' + img.fileName);
      console.log('   Path: ' + (img.filePath || 'no path'));
      console.log('   Storage: ' + (isS3 ? 'S3 ✓' : 'Local/None'));
      console.log('   Created: ' + img.createdAt);
      console.log('');
    });
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
