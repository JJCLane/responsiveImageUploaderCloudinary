// Get .env stuff
require('dotenv').config();

const cloudinary = require('cloudinary');
const fs = require('fs');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});
const ENABLE_WEBP = true;
const DISABLE_CLOUDINARY_OUTPUT = true;

// Parse the JSON file of images to upload
const photosToUpload = JSON.parse(fs.readFileSync('./photosToUpload.json', 'utf8'));

function renderImage(index, {
  maxViewportWidth,
  maxWidth,
  viewportRatio,
  screenMinWidth,
  screenMaxWidth,
  srcset,
  src,
  type,
  alt
}) {
  let tag = 'img';
  let media = '';
  if (index > 0) {
    // This is one of the smaller images within a picture element
    tag = 'source';
    if (screenMinWidth || screenMaxWidth){
      media = `media="${
        screenMinWidth ? 
          `(min-width: ${screenMinWidth}px)` : ``
        }${screenMinWidth && screenMaxWidth ? ' and ' : ''}${
          screenMaxWidth ? 
            `(max-width: ${screenMaxWidth}px)` : ``
        }"`;
    }
  }

  return `
  <${tag} ${media}
    sizes="(max-width: ${maxViewportWidth}px) ${viewportRatio}vw, ${maxWidth}px"
    srcset="${srcset}" ${type ? `
    type="${type}"` : ''}${tag === 'img' ? `
    src="${src}" 
    alt="${alt}"` : ''}
  />`;
}

function handleUpload(original, settings, upload) {
  const derivatives = upload.responsive_breakpoints;
  const isPicture = ENABLE_WEBP || (derivatives.length > 1);
  let imgTag = isPicture ? '\n<picture>' : '';
  let contentfulImgTag = isPicture ? '\n<picture>' : '';

  derivatives.reverse().forEach(function(derivative, forwardIndex) {
    const dIndex = (derivatives.length - 1) - forwardIndex;
    let srcSet = '';
    let contentfulSrcSet = '';
    let webP = '';
    let fallbackImg = '';
    const config = settings[dIndex];
    const maxWidth = derivative.breakpoints[0].width;
    const maxViewportWidth  = Math.round(maxWidth / (config.view_port_ratio / 100.0)); 
    derivative.breakpoints.forEach(function(breakpoint, index) {
      let height = 0;
      if (config.transformation.aspect_ratio) {
        const [, w, h] = (config.transformation.aspect_ratio.match(/(\d+):(\d+)/));
        height = Math.ceil(breakpoint.width * (parseInt(h) / parseInt(w)));
      }
      const imageUrl = `${original.location}?w=${breakpoint.width}${height ? `&h=${height}&fit=thumb&f=faces` : ''}`;
      fallbackImg = imageUrl;
      let lineBreak = '';
      if (index !== 0) {
        lineBreak = `,\n\t\t`;
      }
      srcSet = breakpoint.secure_url + ` ${breakpoint.width}w${lineBreak}` + srcSet;
      webP             = `${imageUrl}&fm=webp ${breakpoint.width}w${lineBreak}` + webP;
      contentfulSrcSet = `${imageUrl} ${breakpoint.width}w${lineBreak}` + contentfulSrcSet;
      
    });
    const imageMeta = {
      maxViewportWidth,
      maxWidth,
      viewportRatio: config.view_port_ratio,
      screenMinWidth: config.screen_min_width,
      screenMaxWidth: config.screen_max_width,
      alt: original.alt || ''
    };
    if (!DISABLE_CLOUDINARY_OUTPUT) {
      imgTag += renderImage(dIndex, {
        ...imageMeta,
        srcset: srcSet,
        src: upload.secure_url,
      });
    }
    contentfulImgTag += renderImage(dIndex + 1, {
      ...imageMeta,
      srcset: webP,
      type: 'image/webp',
    });
    contentfulImgTag += renderImage(dIndex, {
      ...imageMeta,
      srcset: contentfulSrcSet,
      src: fallbackImg,
    });
  });
  if (isPicture) {
    imgTag += '\n</picture>';
    contentfulImgTag += '\n</picture>';
  }
  // Write to output file for easy copy past
  fs.appendFile("./output.html", (DISABLE_CLOUDINARY_OUTPUT) ? contentfulImgTag : imgTag + contentfulImgTag,
  function(err) {
    if (err) {
      return console.log(err);
    }
    console.log(`The file (${original.public_id}) was saved!`);
  });
}

function generateSettings(photo, ratio, i) {
  const viewPortRatio = photo.view_port_ratios && parseInt(photo.view_port_ratios[i]) || 100;
  let maxWidth = photo.max_width || 1000;
  let minWidth = photo.min_width || 200;
  let screenSizes = [];
  if (photo.screen_sizes && photo.screen_sizes[i]) {
    screenSizes = photo.screen_sizes[i].split(',');
    const [calcMinWidth, calcMaxWidth] = screenSizes
      .map((size) => Math.ceil(parseInt(size || 0) * (viewPortRatio / 100.0)));
    minWidth = calcMinWidth > 0 ? calcMinWidth : minWidth;
    maxWidth = calcMaxWidth > 0 ? Math.min(calcMaxWidth, maxWidth) : maxWidth;
  }
  return {
    create_derived: true,
    bytes_step: photo.bytes_step || 35000,
    min_width: minWidth,
    max_width: maxWidth * (photo.retina === false ? 1 : 2),
    screen_min_width: parseInt(screenSizes[0]),
    screen_max_width: parseInt(screenSizes[1]),
    max_images: photo.max_images || 10,
    transformation: photo.transformation || (ratio === 'original') ? {} : {
      crop: 'fill',
      aspect_ratio: ratio
    },
    screen_sizes: photo.screen_sizes || [],
    view_port_ratio: viewPortRatio,
  };
}

photosToUpload.photos.forEach(function(photo) {
  try {
    if (fs.existsSync(photo.location)) {
      //file exists
    }
  } catch(err) {
    console.error(err);
    return;
  }

  const settings = (photo.aspect_ratios || ['original']).map((ratio, i) => generateSettings(photo, ratio, i));
  const ogSettings = JSON.parse(JSON.stringify(settings));
  cloudinary.v2.uploader.upload(photo.location, {
    responsive_breakpoints: settings,
    public_id: photo.public_id
  }, function(error, resp) {
    if (error) {
      console.log(error);
      return;
    }
    handleUpload(photo, ogSettings, resp);
    
  });
})
