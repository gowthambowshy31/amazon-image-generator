import * as dotenv from 'dotenv'
dotenv.config()

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

async function testS3Connection() {
  console.log('🧪 Testing S3 Connection...\n')

  // Check environment variables
  console.log('📋 Checking environment variables:')
  console.log(`   AWS_ACCESS_KEY_ID: ${process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing'}`)
  console.log(`   AWS_SECRET_ACCESS_KEY: ${process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Missing'}`)
  console.log(`   AWS_REGION: ${process.env.AWS_REGION || '❌ Missing'}`)
  console.log(`   AWS_S3_BUCKET_NAME: ${process.env.AWS_S3_BUCKET_NAME || '❌ Missing'}`)
  console.log('')

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET_NAME) {
    console.error('❌ Missing required environment variables!')
    process.exit(1)
  }

  const s3Client = new S3Client({
    region: process.env.AWS_REGION || "eu-north-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  })

  const bucketName = process.env.AWS_S3_BUCKET_NAME
  const testKey = "test-connection.txt"
  const testContent = `S3 connection test - ${new Date().toISOString()}`

  try {
    // Test upload
    console.log('📤 Testing upload...')
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: testKey,
        Body: testContent,
        ContentType: "text/plain",
      })
    )
    console.log('   ✅ Upload successful!')

    const url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${testKey}`
    console.log(`   📎 URL: ${url}`)

    // Test delete
    console.log('\n🗑️  Testing delete...')
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: testKey,
      })
    )
    console.log('   ✅ Delete successful!')

    console.log('\n' + '='.repeat(50))
    console.log('🎉 S3 CONNECTION SUCCESSFUL!')
    console.log('='.repeat(50))
    console.log('\nYou can now run: npm run populate:fba')
    console.log('Images will be uploaded to S3 automatically.')

  } catch (error) {
    console.error('\n❌ S3 Connection Failed!')
    console.error('Error:', error instanceof Error ? error.message : error)
    console.log('\nPossible issues:')
    console.log('1. Check your AWS credentials are correct')
    console.log('2. Check the bucket name exists')
    console.log('3. Check your IAM user has S3 permissions')
    console.log('4. Check the bucket region matches AWS_REGION')
    process.exit(1)
  }
}

testS3Connection()
