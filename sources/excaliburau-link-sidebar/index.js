/**
 * Restores the Link workspace on the sidebar (hidden by default in the base app).
 */
module.exports = {
  name: 'Link Sidebar',
  version: '1.0.0',

  activate(ctx) {
    ctx.ui.enableFeature('link-sidebar');
    ctx.log('Link sidebar enabled');
  },

  deactivate(ctx) {
    ctx.ui.disableFeature('link-sidebar');
    ctx.log('Link sidebar disabled');
  },
};
