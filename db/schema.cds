namespace job.application;

using { cuid, managed } from '@sap/cds/common';

entity Applications : cuid, managed {
  status          : String(20) not null default 'PROCESSING';
  targetEmail     : String(255) not null;
  company         : String(200);
  jobTitle        : String(200);
  firstName       : String(100) not null;
  lastName        : String(100) not null;
  email           : String(255) not null;
  phone           : String(80);
  street          : String(200);
  postalCode      : String(20);
  city            : String(120);
  country         : String(120);
  linkedIn        : String(500);
  currentTitle    : String(200);
  skills          : LargeString;
  languages       : LargeString;
  coverLetter     : LargeString;
  consent         : Boolean not null default false;
  mailMessageId   : String(500);
  errorMessage    : LargeString;
  documents       : Composition of many Documents
                      on documents.application = $self;
}

entity Documents : cuid, managed {
  application     : Association to Applications not null;
  category        : String(20) not null;
  fileName        : String(255) not null;
  mimeType        : String(120) not null;
  sizeBytes       : Integer64 not null;
  sha256          : String(64) not null;
}

@assert.unique.slug: [slug]
entity LandingPages : cuid, managed {
  title            : String(120) not null;
  slug             : String(80) not null;
  sortOrder        : Integer not null;
  isHome           : Boolean not null default false;
  revision         : Integer not null default 1;
  blocks           : Composition of many LandingBlocks
                       on blocks.page = $self;
}

entity LandingBlocks : cuid, managed {
  page             : Association to LandingPages;
  sortOrder        : Integer not null;
  blockTag         : String(81);
  imageUrl         : String(2048);
  imageAlt         : String(255);
  imageWidth       : String(32) default '44%';
  imageHeight      : String(32) default '28rem';
  imagePosition    : String(20) default 'left';
  imageFit         : String(20) default 'cover';
  blockHeight      : String(32) default '30rem';
  contentWidth     : String(32) default '84rem';
  paddingTop       : String(32) default 'auto';
  paddingRight     : String(32) default 'auto';
  paddingBottom    : String(32) default 'auto';
  paddingLeft      : String(32) default 'auto';
  backgroundCrop   : String(20) default 'auto';
  blockWidth       : String(20) default 'full';
  parentBlockId    : UUID;
  nestedX          : Integer default 25;
  nestedY          : Integer default 25;
  nestedWidth      : Integer default 50;
  nestedHeight     : Integer default 50;
  transparentBackground : Boolean default false;
  textHtml         : LargeString;
  textAlign        : String(20) default 'left';
  menuItems        : LargeString;
  menuOrientation  : String(20) default 'horizontal';
  menuGap          : String(32) default '1.5rem';
  menuFontSize     : String(32) default '1rem';
  menuTextColor    : String(7);
  menuTextEffect   : String(20) default 'none';
  buttonText       : String(120);
  buttonUrl        : String(2048);
  buttonType       : String(30) default 'Emphasized';
  buttonWidth      : String(32) default 'auto';
  buttonHeight     : String(32) default '3.25rem';
  buttonBorderRadius : String(32) default '0.25rem';
  buttonAlign      : String(20) default 'inherit';
  theme            : String(80) default 'light';
}

@assert.unique.name: [name]
entity LandingThemes : cuid, managed {
  name                  : String(80) not null;
  backgroundColor       : String(7) not null;
  textColor             : String(7) not null;
  headingColor          : String(7) not null;
  accentColor           : String(7) not null;
  linkColor             : String(7) not null;
  buttonBackgroundColor : String(7) not null;
  buttonTextColor       : String(7) not null;
  buttonBorderColor     : String(7) not null;
  borderColor           : String(7) not null;
  overlayColor          : String(7) not null;
  overlayOpacity        : Integer not null default 45;
}

entity LandingImages : cuid, managed {
  fileName         : String(255) not null;
  mimeType         : String(120) not null @Core.IsMediaType;
  sizeBytes        : Integer64 not null;
  content          : LargeBinary
                       @Core.MediaType: mimeType
                       @Core.ContentDisposition.Filename: fileName
                       @Core.ContentDisposition.Type: 'inline';
}
