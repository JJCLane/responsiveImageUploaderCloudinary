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

// Parse the JSON file of images to upload
const photosToUpload = JSON.parse(fs.readFileSync('./photosToUpload.json', 'utf8'));

function handleUpload(original, settings, upload) {
  const derivatives = upload.responsive_breakpoints;
  let imgTag = '';

  derivatives.forEach(function(derivative, dIndex) {
    let srcSet = '';
    let contentfulSrcSet = '';
    const config = settings[dIndex];
    const maxWidth = derivative.breakpoints[0].width;
    const maxViewportWidth  = Math.round(maxWidth / (config.view_port_ratio / 100.0)); 
    derivative.breakpoints.forEach(function(breakpoint, index) {
      srcSet = srcSet.concat(breakpoint.secure_url, ` ${breakpoint.width}w`);
      let height = 0;
      if (config.transformation.aspect_ratio) {
        const [, w, h] = (config.transformation.aspect_ratio.match(/(\d+):(\d+)/));
        height = Math.ceil(breakpoint.width * (parseInt(h) / parseInt(w)));
      }
      contentfulSrcSet += `${original.location}?w=${breakpoint.width}${height ? `&h=${height}&fit=crop` : ''} ${breakpoint.width}w`;
      if (index !== derivative.breakpoints.length - 1) {
        srcSet += `, \n \t \t`;
        contentfulSrcSet += `, \n \t \t`;
      }
    })

    
    // Template literals preserve leading whitespace
    imgTag += `
  <!-- Upload for PUBLIC_ID ${upload.public_id}  -->
  <img sizes="(max-width: ${maxViewportWidth}px) ${config.view_port_ratio}vw, ${maxWidth}px"
  srcset="${srcSet}"
  src="${upload.secure_url}"
  alt=""
  />`;

    imgTag += `
  <img sizes="(max-width: ${maxViewportWidth}px) ${settings[dIndex].view_port_ratio}vw, ${maxWidth}px"
    srcset="${contentfulSrcSet}"
    src="${original.location}"
    alt="${original.alt || ''}"
  />
    `;
  });

  // Write to output file for easy copy past
  fs.appendFile("./output.html", imgTag, function(err) {
    if (err) {
      return console.log(err);
    }
    console.log("The file was saved!");
  });
}

function generateSettings(photo, ratio, i) {
  let maxWidth = photo.max_width || 1000;
  let minWidth = photo.min_width || 200;
  let viewPortRatio = photo.view_port_ratios && parseInt(photo.view_port_ratios[i]) || 100;
  if (photo.screen_sizes && photo.screen_sizes[i]) {
    const [calcMinWidth, calcMaxWidth] = photo.screen_sizes[i]
      .split(',')
      .map((size) => Math.ceil(parseInt(size || 0) * (viewPortRatio / 100.0)));
    minWidth = calcMinWidth > 0 ? calcMinWidth : minWidth;
    maxWidth = calcMaxWidth > 0 ? Math.min(calcMaxWidth, maxWidth) : maxWidth;
  }
  return {
    create_derived: true,
    bytes_step: photo.bytes_step || 25000,
    min_width: minWidth,
    max_width: maxWidth * (photo.retina === false ? 1 : 2),
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
