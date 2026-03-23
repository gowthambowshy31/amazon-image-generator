import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import * as dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Starting database seed...')

  // Create Privosa organization
  const privosaOrg = await prisma.organization.upsert({
    where: { slug: 'privosa' },
    update: {},
    create: {
      name: 'Privosa',
      slug: 'privosa',
    }
  })

  console.log('✅ Created organization:', privosaOrg.name)

  // Create default users
  const adminPassword = await bcrypt.hash('Privosa@123', 10)

  const admin = await prisma.user.upsert({
    where: { email: 'gowtham@privosa.com' },
    update: {
      password: adminPassword,
      organizationId: privosaOrg.id,
    },
    create: {
      email: 'gowtham@privosa.com',
      name: 'Gowtham',
      password: adminPassword,
      role: 'ADMIN',
      organizationId: privosaOrg.id,
    }
  })

  console.log('✅ Created user:', admin.email)

  // Associate any existing products without an organization to Privosa
  const unassignedProducts = await prisma.product.updateMany({
    where: { organizationId: null as any },
    data: { organizationId: privosaOrg.id }
  })

  if (unassignedProducts.count > 0) {
    console.log(`✅ Associated ${unassignedProducts.count} existing products with Privosa`)
  }

  // Create default image types
  const imageTypes = [
    {
      name: 'Front View',
      description: 'Professional front view of the product on white background',
      order: 1,
      defaultPrompt: 'Create a professional product photo of {product_name} from the front view with studio lighting on a pure white background. Ensure the product is centered and fills the frame appropriately.'
    },
    {
      name: 'Side View',
      description: 'Side angle view showing product depth',
      order: 2,
      defaultPrompt: 'Create a professional product photo of {product_name} from the side view with studio lighting on a pure white background. Show the product depth and profile clearly.'
    },
    {
      name: 'Top View',
      description: 'Birds eye view of the product',
      order: 3,
      defaultPrompt: 'Create a professional product photo of {product_name} from the top view (birds eye perspective) with even lighting on a pure white background.'
    },
    {
      name: 'Lifestyle',
      description: 'Product in use or lifestyle setting',
      order: 4,
      defaultPrompt: 'Create a lifestyle photo of {product_name} being used in a realistic setting. Show the product in context with natural lighting and an appealing background.'
    },
    {
      name: 'Detail Shot',
      description: 'Close-up of important product features',
      order: 5,
      defaultPrompt: 'Create a detailed close-up photo of {product_name} highlighting important features, textures, and quality. Use macro photography style with sharp focus.'
    },
    {
      name: 'Packaging',
      description: 'Product with its packaging',
      order: 6,
      defaultPrompt: 'Create a professional photo of {product_name} with its packaging displayed. Show both the product and package attractively on a white background.'
    },
    {
      name: 'Infographic',
      description: 'Product with text and feature callouts',
      order: 7,
      defaultPrompt: 'Create an infographic style image of {product_name} with key features highlighted. Include text callouts for important specifications and benefits.'
    }
  ]

  for (const imageType of imageTypes) {
    await prisma.imageType.upsert({
      where: { name: imageType.name },
      update: imageType,
      create: imageType
    })
  }

  console.log(`✅ Created ${imageTypes.length} image types`)

  // Create PromptTemplate equivalents for each ImageType (unified system)
  const imageTemplates = [
    {
      name: 'Front View',
      description: 'Professional front view of the product on white background',
      category: 'image',
      order: 1,
      promptText: 'Create a professional product photo of {{product_name}} from the front view with studio lighting on a pure white background. Ensure the product is centered and fills the frame appropriately.',
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 }
      ]
    },
    {
      name: 'Side View',
      description: 'Side angle view showing product depth',
      category: 'image',
      order: 2,
      promptText: 'Create a professional product photo of {{product_name}} from the side view with studio lighting on a pure white background. Show the product depth and profile clearly.',
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 }
      ]
    },
    {
      name: 'Top View',
      description: 'Birds eye view of the product',
      category: 'image',
      order: 3,
      promptText: 'Create a professional product photo of {{product_name}} from the top view (birds eye perspective) with even lighting on a pure white background.',
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 }
      ]
    },
    {
      name: 'Lifestyle',
      description: 'Product in use or lifestyle setting',
      category: 'image',
      order: 4,
      promptText: 'Create a lifestyle photo of {{product_name}} being used in a realistic setting. Show the product in context with natural lighting and an appealing background.',
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 }
      ]
    },
    {
      name: 'Detail Shot',
      description: 'Close-up of important product features',
      category: 'image',
      order: 5,
      promptText: 'Create a detailed close-up photo of {{product_name}} highlighting important features, textures, and quality. Use macro photography style with sharp focus.',
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 }
      ]
    },
    {
      name: 'Packaging',
      description: 'Product with its packaging',
      category: 'image',
      order: 6,
      promptText: 'Create a professional photo of {{product_name}} with its packaging displayed. Show both the product and package attractively on a white background.',
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 }
      ]
    },
    {
      name: 'Infographic',
      description: 'Product with text and feature callouts',
      category: 'image',
      order: 7,
      promptText: 'Create an infographic style image of {{product_name}} with key features highlighted. Include text callouts for important specifications and benefits.',
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 }
      ]
    }
  ]

  for (const template of imageTemplates) {
    const { variables, ...templateData } = template

    const createdTemplate = await prisma.promptTemplate.upsert({
      where: { name: template.name },
      update: {
        description: templateData.description,
        promptText: templateData.promptText,
        category: templateData.category,
        order: templateData.order,
        isActive: true
      },
      create: {
        name: templateData.name,
        description: templateData.description,
        promptText: templateData.promptText,
        category: templateData.category,
        order: templateData.order,
        isActive: true
      }
    })

    await prisma.templateVariable.deleteMany({
      where: { templateId: createdTemplate.id }
    })

    for (const variable of variables) {
      await prisma.templateVariable.create({
        data: {
          templateId: createdTemplate.id,
          name: variable.name,
          displayName: variable.displayName,
          type: variable.type as 'TEXT' | 'DROPDOWN' | 'AUTO',
          isRequired: variable.isRequired,
          defaultValue: null,
          options: [],
          autoFillSource: variable.autoFillSource || null,
          order: variable.order
        }
      })
    }
  }

  console.log(`✅ Created ${imageTemplates.length} image prompt templates (unified system)`)

  // Create default video types
  const videoTypes = [
    {
      name: 'Product Showcase',
      description: 'Professional product showcase highlighting key features',
      order: 1,
      defaultPrompt: 'Create a professional product showcase video for {product_name}. Show the product from multiple angles with smooth camera movements. Highlight key features with elegant transitions. Use professional lighting and a clean white background.'
    },
    {
      name: 'Feature Demo',
      description: 'Demonstrate product features in action',
      order: 2,
      defaultPrompt: 'Create a feature demonstration video for {product_name}. Show the product in use, highlighting its main features and functionality. Use dynamic camera angles and smooth transitions to showcase how the product works.'
    },
    {
      name: 'Lifestyle Scene',
      description: 'Product in realistic lifestyle setting',
      order: 3,
      defaultPrompt: 'Create a lifestyle video showing {product_name} in a realistic setting. Show the product being used naturally with ambient lighting. Include contextual environment that makes the product appealing and relatable.'
    },
    {
      name: '360° Rotation',
      description: 'Full 360-degree product rotation',
      order: 4,
      defaultPrompt: 'Create a smooth 360-degree rotation video of {product_name}. Show the product rotating on a turntable with professional studio lighting on a white background. Ensure smooth, continuous motion and even lighting throughout.'
    },
    {
      name: 'Unboxing Experience',
      description: 'Product unboxing and first impressions',
      order: 5,
      defaultPrompt: 'Create an unboxing experience video for {product_name}. Show the product package being opened, revealing the product inside. Highlight the packaging quality and product presentation with smooth camera movements.'
    },
    {
      name: 'Detail Focus',
      description: 'Close-up video of product details',
      order: 6,
      defaultPrompt: 'Create a detailed close-up video of {product_name}. Use macro cinematography to showcase textures, materials, and craftsmanship. Pan slowly across important features with sharp focus and professional lighting.'
    },
    {
      name: 'Social Media Short',
      description: 'Quick engaging video for social platforms',
      order: 7,
      defaultPrompt: 'Create a short, engaging social media video for {product_name}. Use dynamic cuts, attractive angles, and eye-catching visuals. Keep it fast-paced and visually appealing for social media audiences.'
    }
  ]

  for (const videoType of videoTypes) {
    await prisma.videoType.upsert({
      where: { name: videoType.name },
      update: videoType,
      create: videoType
    })
  }

  console.log(`✅ Created ${videoTypes.length} video types`)

  // Create Amazon/Walmart listing prompt templates for jewelry
  const amazonWalmartTemplates = [
    {
      name: 'Jewelry - Image 1: Front & Side Angles',
      description: 'Front facing and side facing angles on white background for jewelry products',
      category: 'image',
      promptText: `Hyper-realistic product photography of a pair of {{metal_type}} {{jewelry_description}} like the {{jewelry_type}} in the attached image. The metal is polished with a {{metal_finish}} finish. The closure mechanism is a {{closure_type}}. The {{jewelry_type}} are placed in a balanced, centered composition with a wide, generous margin of negative space around them to create a minimalist luxury feel such that they occupy approximately 40-50% of the canvas. The left piece is framed straight-on to show the full frontal {{stone_type}} row, while the right piece is slightly staggered and tilted at a 45-degree angle to showcase the side profile and interior stones. Position the camera at a slight 'eye-level' elevation to give the subject a grounded, three-dimensional presence. Use soft, diffused overhead studio lighting on a seamless pure white background with a hint of soft, natural drop shadow. Macro focus, 8k resolution, clean e-commerce framing. Use perfectly symmetrical stones with high fire, brilliance, and sharp facets.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'metal_type', displayName: 'Metal Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 1, defaultValue: '18k white gold', options: ['18k white gold', '14k white gold', '18k yellow gold', '14k yellow gold', '18k rose gold', '14k rose gold', 'platinum', 'sterling silver'] },
        { name: 'jewelry_description', displayName: 'Jewelry Description', type: 'TEXT', isRequired: true, autoFillSource: null, order: 2, defaultValue: "oval 'inside-out' diamond hoop earrings" },
        { name: 'jewelry_type', displayName: 'Jewelry Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 3, defaultValue: 'earrings', options: ['earrings', 'necklace', 'pendant', 'ring', 'bracelet', 'bangle', 'anklet', 'brooch'] },
        { name: 'metal_finish', displayName: 'Metal Finish', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 4, defaultValue: 'mirror-like polished', options: ['mirror-like polished', 'brushed satin', 'hammered', 'matte', 'textured'] },
        { name: 'closure_type', displayName: 'Closure Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 5, defaultValue: 'screwback', options: ['screwback', 'butterfly back (push back)', 'lever back', 'hinge snap', 'lobster clasp', 'spring ring clasp', 'toggle clasp', 'hook', 'post', 'clip-on', 'none / not applicable'] },
        { name: 'stone_type', displayName: 'Stone Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 6, defaultValue: 'round brilliant diamond', options: ['round brilliant diamond', 'oval diamond', 'princess cut diamond', 'emerald cut diamond', 'cushion cut diamond', 'pear shaped diamond', 'marquise diamond', 'moissanite', 'cubic zirconia', 'sapphire', 'emerald', 'ruby', 'lab-grown diamond'] }
      ]
    },
    {
      name: 'Jewelry - Image 2: Alternate Angle',
      description: 'Alternate angle on white background (for pendants, rings, etc)',
      category: 'image',
      promptText: `Hyper-realistic product photography of {{metal_type}} {{jewelry_description}} like the {{jewelry_type}} in the attached image. The metal is polished with a {{metal_finish}} finish. The {{jewelry_type}} are placed in a balanced, centered composition with a wide, generous margin of negative space around them to create a minimalist luxury feel such that they occupy approximately 40-50% of the canvas. The subject is tilted at a 45-degree angle to showcase the side profile. Position the camera at a slight 'eye-level' elevation to give the subject a grounded, three-dimensional presence. Use soft, diffused overhead studio lighting on a seamless pure white background with a hint of soft, natural drop shadow. Macro focus, 8k resolution, clean e-commerce framing. Use perfectly symmetrical {{stone_type}} stones with high fire, brilliance, and sharp facets.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'metal_type', displayName: 'Metal Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 1, defaultValue: '18k white gold', options: ['18k white gold', '14k white gold', '18k yellow gold', '14k yellow gold', '18k rose gold', '14k rose gold', 'platinum', 'sterling silver'] },
        { name: 'jewelry_description', displayName: 'Jewelry Description', type: 'TEXT', isRequired: true, autoFillSource: null, order: 2, defaultValue: "oval 'inside-out' diamond hoop earrings" },
        { name: 'jewelry_type', displayName: 'Jewelry Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 3, defaultValue: 'earrings', options: ['earrings', 'necklace', 'pendant', 'ring', 'bracelet', 'bangle', 'anklet', 'brooch'] },
        { name: 'metal_finish', displayName: 'Metal Finish', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 4, defaultValue: 'mirror-like polished', options: ['mirror-like polished', 'brushed satin', 'hammered', 'matte', 'textured'] },
        { name: 'stone_type', displayName: 'Stone Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 5, defaultValue: 'round brilliant diamond', options: ['round brilliant diamond', 'oval diamond', 'princess cut diamond', 'emerald cut diamond', 'cushion cut diamond', 'pear shaped diamond', 'marquise diamond', 'moissanite', 'cubic zirconia', 'sapphire', 'emerald', 'ruby', 'lab-grown diamond'] }
      ]
    },
    {
      name: 'Jewelry - Image 3: Natural Surface Flat-lay',
      description: 'Hyper-realistic image with shadows on a natural surface',
      category: 'image',
      promptText: `Professional flat-lay product photography of {{metal_type}} {{jewelry_description}} like the {{jewelry_type}} in the attached image. The closure mechanism is a {{closure_type}}. The subject is laid flat on a minimalist {{surface}} surface, arranged in a balanced diagonal composition. The subjects are oriented to clearly showcase the {{stone_type}} stones. Use soft, natural sunlight lighting that casts a distinct, natural shadow. Macro focus with sharp detail on the stone facets and the {{metal_finish}} metal finish. Use 8k resolution and a clean and airy luxury e-commerce aesthetic. Use perfectly symmetrical stones with high fire, brilliance, and sharp facets. The subject is placed in a balanced, centered composition with a wide, generous margin of negative space around them to create a minimalist luxury feel such that they occupy approximately 40-50% of the canvas.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'metal_type', displayName: 'Metal Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 1, defaultValue: '18k white gold', options: ['18k white gold', '14k white gold', '18k yellow gold', '14k yellow gold', '18k rose gold', '14k rose gold', 'platinum', 'sterling silver'] },
        { name: 'jewelry_description', displayName: 'Jewelry Description', type: 'TEXT', isRequired: true, autoFillSource: null, order: 2, defaultValue: "oval 'inside-out' diamond hoop earrings" },
        { name: 'jewelry_type', displayName: 'Jewelry Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 3, defaultValue: 'earrings', options: ['earrings', 'necklace', 'pendant', 'ring', 'bracelet', 'bangle', 'anklet', 'brooch'] },
        { name: 'closure_type', displayName: 'Closure Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 4, defaultValue: 'screwback', options: ['screwback', 'butterfly back (push back)', 'lever back', 'hinge snap', 'lobster clasp', 'spring ring clasp', 'toggle clasp', 'hook', 'post', 'clip-on', 'none / not applicable'] },
        { name: 'stone_type', displayName: 'Stone Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 5, defaultValue: 'round brilliant diamond', options: ['round brilliant diamond', 'oval diamond', 'princess cut diamond', 'emerald cut diamond', 'cushion cut diamond', 'pear shaped diamond', 'marquise diamond', 'moissanite', 'cubic zirconia', 'sapphire', 'emerald', 'ruby', 'lab-grown diamond'] },
        { name: 'metal_finish', displayName: 'Metal Finish', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 6, defaultValue: 'high-polish', options: ['high-polish', 'brushed satin', 'hammered', 'matte', 'textured'] },
        { name: 'surface', displayName: 'Surface Material', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 7, defaultValue: 'white fabric', options: ['white fabric', 'white marble', 'light linen', 'natural stone', 'cream silk', 'light wood'] }
      ]
    },
    {
      name: 'Jewelry - Image 4: Model Wearing',
      description: 'True to size jewelry on a human model',
      category: 'image',
      promptText: `High-end fashion editorial photography of a woman's {{body_part}} featuring the {{jewelry_type}} in the attached image. Use perfectly symmetrical {{stone_type}} stones with high fire, brilliance, and sharp facets. The metal is {{metal_type}} with a {{metal_finish}} finish. The model has {{model_hair}} hair {{model_hair_style}} to showcase the jewelry. She is wearing {{model_outfit}}. The background is a clean, minimalist {{background_color}} studio wall. Lighting is soft and diffused, coming from the side to create gentle, natural shadows on the skin and a soft 'glow' on the polished metal. Close-up macro shot, sharp focus on the jewelry, 8k resolution, clean luxury aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'body_part', displayName: 'Body Part Shown', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 1, defaultValue: 'ear', options: ['ear', 'neck and décolletage', 'hand and fingers', 'wrist', 'both ears (front facing)', 'full face and neck'] },
        { name: 'jewelry_type', displayName: 'Jewelry Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 2, defaultValue: 'earrings', options: ['earrings', 'necklace', 'pendant', 'ring', 'bracelet', 'bangle', 'anklet', 'brooch'] },
        { name: 'stone_type', displayName: 'Stone Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 3, defaultValue: 'round brilliant diamond', options: ['round brilliant diamond', 'oval diamond', 'princess cut diamond', 'emerald cut diamond', 'cushion cut diamond', 'pear shaped diamond', 'marquise diamond', 'moissanite', 'cubic zirconia', 'sapphire', 'emerald', 'ruby', 'lab-grown diamond'] },
        { name: 'metal_type', displayName: 'Metal Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 4, defaultValue: '18k white gold', options: ['18k white gold', '14k white gold', '18k yellow gold', '14k yellow gold', '18k rose gold', '14k rose gold', 'platinum', 'sterling silver'] },
        { name: 'metal_finish', displayName: 'Metal Finish', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 5, defaultValue: 'mirror-like polished', options: ['mirror-like polished', 'brushed satin', 'hammered', 'matte', 'textured'] },
        { name: 'model_hair', displayName: 'Model Hair Color', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 6, defaultValue: 'dark brown', options: ['dark brown', 'black', 'blonde', 'light brown', 'auburn red', 'gray/silver'] },
        { name: 'model_hair_style', displayName: 'Model Hair Style', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 7, defaultValue: 'pulled back into a soft ponytail, tucked behind her ear', options: ['pulled back into a soft ponytail, tucked behind her ear', 'in a sleek updo', 'loose flowing over shoulders', 'in a low bun', 'swept to one side'] },
        { name: 'model_outfit', displayName: 'Model Outfit', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 8, defaultValue: 'a structured tan or camel-colored blazer', options: ['a structured tan or camel-colored blazer', 'a classic black dress', 'a white silk blouse', 'a navy blue top', 'an off-shoulder evening dress', 'a simple cream sweater'] },
        { name: 'background_color', displayName: 'Background Color', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 9, defaultValue: 'warm beige', options: ['warm beige', 'pure white', 'light gray', 'soft blush pink', 'charcoal', 'cream'] }
      ]
    },
    {
      name: 'Jewelry - Image 5: Size Reference',
      description: 'Measurement image next to a coin or ruler',
      category: 'image',
      promptText: `Professional product photography showing the {{jewelry_type}} next to a {{reference_object}} for scale reference. The {{jewelry_type}} is {{metal_type}} {{jewelry_description}}. The {{jewelry_type}} and reference object are placed on a clean white background with soft, even lighting. The composition clearly shows the actual size of the jewelry piece. Use sharp focus on both the jewelry and the reference object. 8k resolution, clean e-commerce aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'jewelry_type', displayName: 'Jewelry Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 1, defaultValue: 'earrings', options: ['earrings', 'necklace', 'pendant', 'ring', 'bracelet', 'bangle', 'anklet', 'brooch'] },
        { name: 'metal_type', displayName: 'Metal Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 2, defaultValue: '18k white gold', options: ['18k white gold', '14k white gold', '18k yellow gold', '14k yellow gold', '18k rose gold', '14k rose gold', 'platinum', 'sterling silver'] },
        { name: 'jewelry_description', displayName: 'Jewelry Description', type: 'TEXT', isRequired: true, autoFillSource: null, order: 3, defaultValue: "oval 'inside-out' diamond hoop earrings" },
        { name: 'reference_object', displayName: 'Size Reference Object', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 4, defaultValue: 'US quarter coin', options: ['US quarter coin', 'US dime coin', 'ruler (inches)', 'ruler (centimeters)', 'pencil', 'credit card'] }
      ]
    },
    {
      name: 'Jewelry - Image 6: Privosa Packaging',
      description: 'Product in Privosa branded packaging',
      category: 'image',
      promptText: `Place the attached {{jewelry_type}} from the 1st image in Privosa packaging as shown in the 2nd image. The {{jewelry_type}} is {{metal_type}} with {{stone_type}} stones. Use soft, diffused overhead studio lighting on a seamless pure white background with a hint of soft, natural drop shadow. Macro focus, 8k resolution, clean e-commerce framing. Use perfectly symmetrical stones with high fire, brilliance, and sharp facets for the {{jewelry_type}}.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'jewelry_type', displayName: 'Jewelry Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 1, defaultValue: 'earrings', options: ['earrings', 'necklace', 'pendant', 'ring', 'bracelet', 'bangle', 'anklet', 'brooch'] },
        { name: 'metal_type', displayName: 'Metal Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 2, defaultValue: '18k white gold', options: ['18k white gold', '14k white gold', '18k yellow gold', '14k yellow gold', '18k rose gold', '14k rose gold', 'platinum', 'sterling silver'] },
        { name: 'stone_type', displayName: 'Stone Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 3, defaultValue: 'round brilliant diamond', options: ['round brilliant diamond', 'oval diamond', 'princess cut diamond', 'emerald cut diamond', 'cushion cut diamond', 'pear shaped diamond', 'marquise diamond', 'moissanite', 'cubic zirconia', 'sapphire', 'emerald', 'ruby', 'lab-grown diamond'] }
      ]
    },
    {
      name: 'Jewelry - Video 1: 360° Rotation',
      description: '360 degree rotation video on a white background',
      category: 'video',
      promptText: `Create a smooth 360-degree rotation video of the {{jewelry_type}} in the attached image. The metal is {{metal_type}} with a {{metal_finish}} finish. Show the {{jewelry_type}} rotating slowly on a turntable or floating with elegant motion. Use soft, diffused overhead studio lighting on a seamless pure white background with a subtle reflection. The rotation should be smooth and continuous, showcasing all angles of the piece. The {{stone_type}} stones should show high fire, brilliance, and sharp facets as the piece rotates through the light. 8k resolution, clean luxury e-commerce aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO', isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'jewelry_type', displayName: 'Jewelry Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 1, defaultValue: 'earrings', options: ['earrings', 'necklace', 'pendant', 'ring', 'bracelet', 'bangle', 'anklet', 'brooch'] },
        { name: 'metal_type', displayName: 'Metal Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 2, defaultValue: '18k white gold', options: ['18k white gold', '14k white gold', '18k yellow gold', '14k yellow gold', '18k rose gold', '14k rose gold', 'platinum', 'sterling silver'] },
        { name: 'metal_finish', displayName: 'Metal Finish', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 3, defaultValue: 'mirror-like polished', options: ['mirror-like polished', 'brushed satin', 'hammered', 'matte', 'textured'] },
        { name: 'stone_type', displayName: 'Stone Type', type: 'DROPDOWN', isRequired: true, autoFillSource: null, order: 4, defaultValue: 'round brilliant diamond', options: ['round brilliant diamond', 'oval diamond', 'princess cut diamond', 'emerald cut diamond', 'cushion cut diamond', 'pear shaped diamond', 'marquise diamond', 'moissanite', 'cubic zirconia', 'sapphire', 'emerald', 'ruby', 'lab-grown diamond'] }
      ]
    }
  ]

  for (const template of amazonWalmartTemplates) {
    const { variables, ...templateData } = template

    const createdTemplate = await prisma.promptTemplate.upsert({
      where: { name: template.name },
      update: {
        description: templateData.description,
        promptText: templateData.promptText,
        category: templateData.category,
        isActive: true
      },
      create: {
        name: templateData.name,
        description: templateData.description,
        promptText: templateData.promptText,
        category: templateData.category,
        isActive: true
      }
    })

    // Delete existing variables and recreate them
    await prisma.templateVariable.deleteMany({
      where: { templateId: createdTemplate.id }
    })

    for (const variable of variables) {
      await prisma.templateVariable.create({
        data: {
          templateId: createdTemplate.id,
          name: variable.name,
          displayName: variable.displayName,
          type: variable.type as 'TEXT' | 'DROPDOWN' | 'AUTO',
          isRequired: variable.isRequired,
          defaultValue: ('defaultValue' in variable && variable.defaultValue) ? variable.defaultValue : null,
          options: ('options' in variable && variable.options) ? variable.options as string[] : [],
          autoFillSource: variable.autoFillSource || null,
          order: variable.order
        }
      })
    }
  }

  console.log(`✅ Created ${amazonWalmartTemplates.length} Amazon/Walmart listing templates`)

  // ── Jewelry Marketing & Ads Templates (10 templates) ──
  const jewelryMarketingTemplates = [
    {
      name: 'Jewelry - Social Media Lifestyle',
      description: 'Aspirational lifestyle image for Instagram, Pinterest, and Facebook ads',
      category: 'image',
      order: 20,
      promptText: `Create a stunning aspirational lifestyle photograph featuring {{product_name}}. The jewelry is worn by an elegant woman in a {{setting}} setting. She is dressed in a {{outfit_style}} outfit that complements the jewelry without competing for attention. The lighting is warm golden-hour sunlight with soft bokeh in the background. The composition follows the rule of thirds with the jewelry as the clear focal point. The mood is luxurious yet approachable — perfect for Instagram or Pinterest. 8k resolution, shallow depth of field, editorial fashion photography style.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO' as const, isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'setting', displayName: 'Setting / Location', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 1, defaultValue: 'outdoor café', options: ['outdoor café', 'rooftop terrace', 'art gallery', 'luxury hotel lobby', 'garden party', 'beach sunset', 'city street'] },
        { name: 'outfit_style', displayName: 'Outfit Style', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 2, defaultValue: 'minimalist chic', options: ['minimalist chic', 'classic black dress', 'white blouse', 'evening gown', 'casual elegant', 'business formal'] }
      ]
    },
    {
      name: 'Jewelry - Instagram Story / Reel Thumbnail',
      description: 'Vertical format image optimized for Instagram Stories and Reels',
      category: 'image',
      order: 21,
      promptText: `Create a vertical (9:16 aspect ratio) eye-catching image of {{product_name}} designed for Instagram Stories or Reel thumbnails. The jewelry is the hero element, positioned in the center of the frame with dramatic {{lighting_style}} lighting. Background is a {{background}} gradient or texture. Include generous negative space at the top and bottom for text overlays. The image should feel modern, luxurious, and scroll-stopping. Ultra-sharp macro detail on the diamonds/gems, 8k resolution, contemporary jewelry advertising aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO' as const, isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'lighting_style', displayName: 'Lighting Style', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 1, defaultValue: 'dramatic spotlight', options: ['dramatic spotlight', 'neon glow', 'soft diffused', 'warm golden', 'cool blue'] },
        { name: 'background', displayName: 'Background', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 2, defaultValue: 'deep black', options: ['deep black', 'dark navy', 'burgundy velvet', 'champagne gold', 'soft blush pink', 'marble texture'] }
      ]
    },
    {
      name: 'Jewelry - Facebook / Google Ad Banner',
      description: 'Landscape ad creative for Facebook feed ads or Google Display Network',
      category: 'image',
      order: 22,
      promptText: `Create a professional landscape (16:9) advertising banner image for {{product_name}}. The jewelry is positioned on the {{side}} side of the frame, leaving the other side open for ad copy and CTA buttons. Background is a clean, luxurious {{background_style}}. The jewelry should sparkle with studio-quality lighting that highlights the brilliance of the stones and the polish of the metal. Professional e-commerce advertising aesthetic. 8k resolution, clean composition with clear visual hierarchy.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO' as const, isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'side', displayName: 'Product Position', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 1, defaultValue: 'right', options: ['left', 'right', 'center-left', 'center-right'] },
        { name: 'background_style', displayName: 'Background Style', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 2, defaultValue: 'soft gradient', options: ['soft gradient', 'white marble', 'dark velvet', 'light silk fabric', 'minimalist white'] }
      ]
    },
    {
      name: 'Jewelry - Amazon A+ Content Hero',
      description: 'Premium hero image for Amazon A+ Content / Enhanced Brand Content',
      category: 'image',
      order: 23,
      promptText: `Create a premium hero image for Amazon A+ Content featuring {{product_name}}. The jewelry is displayed on a luxurious {{surface}} surface with elegant props like a small velvet box, silk ribbon, or fresh flowers to create a gift-worthy atmosphere. The composition is wide (landscape) with the jewelry as the clear focal point in the center-left area. Use soft, diffused studio lighting with subtle reflections. The overall feel should communicate premium quality, gift-ability, and luxury. Background transitions to clean white or very light tones at the edges. 8k resolution, high-end product photography aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO' as const, isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'surface', displayName: 'Display Surface', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 1, defaultValue: 'white marble', options: ['white marble', 'dark wood', 'velvet cushion', 'mirrored surface', 'natural stone', 'silk fabric'] }
      ]
    },
    {
      name: 'Jewelry - Shopify Collection Banner',
      description: 'Wide banner image for Shopify collection pages or homepage hero',
      category: 'image',
      order: 24,
      promptText: `Create a wide panoramic (21:9 or ultra-wide) banner image for a Shopify jewelry store featuring {{product_name}}. The jewelry is artfully arranged with {{composition_style}}. The background is {{background_tone}} with subtle luxury textures. Leave generous space on one side for overlaying collection title text. The lighting is soft and even with controlled highlights that make the jewelry sparkle. The mood should feel curated, modern, and aspirational — like a high-end jewelry brand homepage. 8k resolution, editorial e-commerce aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO' as const, isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'composition_style', displayName: 'Composition Style', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 1, defaultValue: 'minimalist single piece', options: ['minimalist single piece', 'scattered arrangement', 'stacked/layered', 'on display stand', 'floating/suspended'] },
        { name: 'background_tone', displayName: 'Background Tone', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 2, defaultValue: 'warm neutral', options: ['warm neutral', 'cool white', 'soft blush', 'charcoal dark', 'champagne'] }
      ]
    },
    {
      name: 'Jewelry - Gift Guide / Holiday',
      description: 'Seasonal gift-focused image for holiday campaigns and gift guides',
      category: 'image',
      order: 25,
      promptText: `Create a beautiful gift-themed photograph of {{product_name}} styled for a {{season}} campaign. The jewelry is presented in or near a luxurious gift box with {{styling_elements}}. The scene feels warm, festive, and gift-worthy. Use soft, warm lighting with subtle sparkle effects. The background is tastefully decorated to suggest the season without being over-the-top. The composition should make the viewer want to buy this as a gift. 8k resolution, luxury gift photography aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO' as const, isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'season', displayName: 'Season / Occasion', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 1, defaultValue: 'holiday / Christmas', options: ['holiday / Christmas', "Valentine's Day", "Mother's Day", 'anniversary', 'birthday', 'wedding / bridal'] },
        { name: 'styling_elements', displayName: 'Styling Elements', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 2, defaultValue: 'ribbon and wrapping paper', options: ['ribbon and wrapping paper', 'dried flowers and greenery', 'rose petals', 'candles and warm glow', 'confetti and sparkle', 'minimalist tissue paper'] }
      ]
    },
    {
      name: 'Jewelry - Comparison / Before-After',
      description: 'Split image showing the jewelry from two perspectives or with/without context',
      category: 'image',
      order: 26,
      promptText: `Create a professional split-composition image of {{product_name}}. The left half shows the jewelry in a clean, white-background e-commerce style (studio macro shot highlighting every facet and detail). The right half shows the same jewelry being worn by an elegant model in a {{lifestyle_context}} setting. A subtle dividing line or gradient separates the two halves. Both halves have consistent color temperature and quality. This dual-view format helps customers see both the product details and how it looks when worn. 8k resolution, professional jewelry photography.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO' as const, isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'lifestyle_context', displayName: 'Lifestyle Context', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 1, defaultValue: 'evening dinner', options: ['evening dinner', 'office / professional', 'casual brunch', 'red carpet event', 'outdoor wedding'] }
      ]
    },
    {
      name: 'Jewelry - Flat Lay Styled',
      description: 'Instagram-worthy flat lay with curated props and styling',
      category: 'image',
      order: 27,
      promptText: `Create a beautifully styled flat-lay photograph of {{product_name}} shot from directly above (bird's eye view). The jewelry is the hero piece, centered in the frame, surrounded by carefully curated props: {{props}}. The surface is {{surface_material}}. The arrangement follows a balanced, aesthetically pleasing composition with intentional negative space. Lighting is soft, natural, and even — like morning light from a window. The overall mood is aspirational and social-media-ready. 8k resolution, Instagram flat-lay aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO' as const, isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'props', displayName: 'Styling Props', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 1, defaultValue: 'fresh flowers and perfume bottle', options: ['fresh flowers and perfume bottle', 'coffee cup and magazine', 'sunglasses and watch', 'silk scarf and lipstick', 'dried botanicals and candle', 'minimal — jewelry only'] },
        { name: 'surface_material', displayName: 'Surface Material', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 2, defaultValue: 'white marble', options: ['white marble', 'linen fabric', 'light wood', 'terrazzo', 'ceramic plate', 'blush velvet'] }
      ]
    },
    {
      name: 'Jewelry - Close-Up Sparkle / Macro',
      description: 'Extreme close-up highlighting diamond fire, brilliance, and craftsmanship',
      category: 'image',
      order: 28,
      promptText: `Create an extreme macro close-up photograph of {{product_name}} that showcases the brilliance and fire of the diamonds/gemstones. The camera is positioned at a {{angle}} angle. Each facet should reflect light with rainbow fire and white brilliance. The metal should show its polish and craftsmanship with crisp, sharp detail. Background is {{background}} with soft bokeh. Use dramatic, controlled lighting — a combination of direct light for sparkle and diffused light for even coverage. The image should make the viewer feel the quality and luxury of the piece. 8k resolution, luxury macro jewelry photography.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO' as const, isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'angle', displayName: 'Camera Angle', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 1, defaultValue: 'slight tilt (30°)', options: ['straight on', 'slight tilt (30°)', 'dramatic low angle', 'overhead 45°'] },
        { name: 'background', displayName: 'Background', type: 'DROPDOWN' as const, isRequired: true, autoFillSource: null, order: 2, defaultValue: 'deep black', options: ['deep black', 'soft white', 'dark navy blue', 'warm champagne', 'out-of-focus jewelry box'] }
      ]
    },
    {
      name: 'Jewelry - Infographic / Feature Callout',
      description: 'Annotated product image highlighting key features, materials, and specs',
      category: 'image',
      order: 29,
      promptText: `Create a professional infographic-style product image of {{product_name}}. The jewelry is displayed at center with clean white background and studio lighting. Around the jewelry, include elegant callout lines pointing to key features with labels such as: "{{feature_1}}", "{{feature_2}}", and "{{feature_3}}". The callout lines are thin, modern, and gold or dark gray in color. The typography is clean, sans-serif, and luxurious. The overall design feels like a premium brand's product page — informative yet sophisticated. 8k resolution, clean infographic aesthetic.

Product: {{product_name}}`,
      variables: [
        { name: 'product_name', displayName: 'Product Name', type: 'AUTO' as const, isRequired: true, autoFillSource: 'product.title', order: 0 },
        { name: 'feature_1', displayName: 'Feature Callout 1', type: 'TEXT' as const, isRequired: true, autoFillSource: null, order: 1, defaultValue: '18K White Gold' },
        { name: 'feature_2', displayName: 'Feature Callout 2', type: 'TEXT' as const, isRequired: true, autoFillSource: null, order: 2, defaultValue: 'VS Clarity Diamonds' },
        { name: 'feature_3', displayName: 'Feature Callout 3', type: 'TEXT' as const, isRequired: true, autoFillSource: null, order: 3, defaultValue: 'Secure Screwback Closure' }
      ]
    }
  ]

  for (const template of jewelryMarketingTemplates) {
    const { variables, ...templateData } = template

    const createdTemplate = await prisma.promptTemplate.upsert({
      where: { name: template.name },
      update: {
        description: templateData.description,
        promptText: templateData.promptText,
        category: templateData.category,
        order: templateData.order,
        isActive: true
      },
      create: {
        name: templateData.name,
        description: templateData.description,
        promptText: templateData.promptText,
        category: templateData.category,
        order: templateData.order,
        isActive: true
      }
    })

    await prisma.templateVariable.deleteMany({
      where: { templateId: createdTemplate.id }
    })

    for (const variable of variables) {
      await prisma.templateVariable.create({
        data: {
          templateId: createdTemplate.id,
          name: variable.name,
          displayName: variable.displayName,
          type: variable.type as 'TEXT' | 'DROPDOWN' | 'AUTO',
          isRequired: variable.isRequired,
          defaultValue: variable.defaultValue || null,
          options: ('options' in variable && variable.options) ? variable.options : [],
          autoFillSource: variable.autoFillSource || null,
          order: variable.order
        }
      })
    }
  }

  console.log(`✅ Created ${jewelryMarketingTemplates.length} jewelry marketing templates`)

  console.log('🎉 Database seeded successfully!')
  console.log('\nDefault credentials:')
  console.log('  Admin: gowtham@privosa.com / Privosa@123')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
