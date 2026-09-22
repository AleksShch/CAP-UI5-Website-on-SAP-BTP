using { job.application as db } from '../db/schema';

type LandingBlockInput {
  ID            : UUID;
  sortOrder     : Integer;
  blockTag      : String(81);
  imageUrl      : String(2048);
  imageAlt      : String(255);
  imageWidth    : String(32);
  imageHeight   : String(32);
  imagePosition : String(20);
  imageFit      : String(20);
  blockHeight   : String(32);
  contentWidth  : String(32);
  paddingTop    : String(32);
  paddingRight  : String(32);
  paddingBottom : String(32);
  paddingLeft   : String(32);
  backgroundCrop : String(20);
  blockWidth    : String(20);
  parentBlockId : UUID;
  nestedX       : Integer;
  nestedY       : Integer;
  nestedWidth   : Integer;
  nestedHeight  : Integer;
  transparentBackground : Boolean;
  textHtml      : LargeString;
  textAlign     : String(20);
  menuItems     : LargeString;
  menuOrientation : String(20);
  menuGap       : String(32);
  menuFontSize  : String(32);
  menuTextColor : String(7);
  menuTextEffect : String(20);
  buttonText    : String(120);
  buttonUrl     : String(2048);
  buttonType    : String(30);
  buttonWidth   : String(32);
  buttonHeight  : String(32);
  buttonBorderRadius : String(32);
  buttonAlign   : String(20);
  theme         : String(80);
}

type LandingThemeInput {
  name                  : String(80);
  backgroundColor       : String(7);
  textColor             : String(7);
  headingColor          : String(7);
  accentColor           : String(7);
  linkColor             : String(7);
  buttonBackgroundColor : String(7);
  buttonTextColor       : String(7);
  buttonBorderColor     : String(7);
  borderColor           : String(7);
  overlayColor          : String(7);
  overlayOpacity        : Integer;
}

type AiModelOption {
  id    : String(255);
  name  : String(255);
  label : String(511);
}

type AiModelCatalog {
  textModels                 : many AiModelOption;
  imageModels                : many AiModelOption;
  defaultTextModel           : String(255);
  defaultImageModel          : String(255);
  openRouterBalance          : Decimal(15, 6);
  openRouterBalanceAvailable : Boolean;
  openRouterBalanceSource    : String(20);
}

@path: '/odata/v4/landing'
@requires: 'any'
service LandingContentService {
  @readonly entity Pages as projection on db.LandingPages {
    key ID,
    title,
    slug,
    sortOrder,
    isHome,
    revision
  };

  @readonly entity Blocks as projection on db.LandingBlocks {
    key ID,
    page.ID as page_ID,
    sortOrder,
    blockTag,
    imageUrl,
    imageAlt,
    imageWidth,
    imageHeight,
    imagePosition,
    imageFit,
    blockHeight,
    contentWidth,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    backgroundCrop,
    blockWidth,
    parentBlockId,
    nestedX,
    nestedY,
    nestedWidth,
    nestedHeight,
    transparentBackground,
    textHtml,
    textAlign,
    menuItems,
    menuOrientation,
    menuGap,
    menuFontSize,
    menuTextColor,
    menuTextEffect,
    buttonText,
    buttonUrl,
    buttonType,
    buttonWidth,
    buttonHeight,
    buttonBorderRadius,
    buttonAlign,
    theme
  };

  @readonly entity Images as projection on db.LandingImages;
  @readonly entity Themes as projection on db.LandingThemes;
}

@path: '/odata/v4/landing-admin'
@requires: 'ApplicationAdmin'
@impl: './landing-admin-service.js'
service LandingAdminService {
  @readonly entity Pages as projection on db.LandingPages;
  @readonly entity Blocks as projection on db.LandingBlocks;
  @readonly entity Themes as projection on db.LandingThemes;
  entity Images as projection on db.LandingImages;
  action createPage(title: String(120), slug: String(80), copySourcePageId: UUID) returns Pages;
  action deletePage(pageId: UUID) returns Boolean;
  action setHomePage(pageId: UUID) returns Pages;
  action getAiModels() returns AiModelCatalog;
  action generateBlocks(
    pageId: UUID,
    prompt: LargeString,
    outputLanguage: String(80),
    blockCount: Integer,
    placement: String(20),
    textModel: String(255),
    imageModel: String(255)
  ) returns many LandingBlockInput;
  action saveBlocks(pageId: UUID, expectedRevision: Integer, blocks: many LandingBlockInput) returns many Blocks;
  action copyBlock(sourcePageId: UUID, targetPageId: UUID, block: LandingBlockInput) returns Blocks;
  action createTheme(theme: LandingThemeInput) returns Themes;
  action deleteTheme(themeId: UUID) returns Boolean;
}
