// Names and descriptions of the business templates and the optional modules they
// switch on. Shared by first-run setup and by Settings, so the two cannot describe
// the same module differently.
export const business = {
  templateGeneralRetail: 'General retail',
  templateGeneralRetailHint:
    'Shops, services and anything sold at a counter. Starts with the essentials only.',
  templateRestaurant: 'Restaurant & café',
  templateRestaurantHint: 'Adds tables, the kitchen display and a QR menu.',
  moduleTables: 'Tables',
  moduleTablesHint: 'Floor plan and table status for dine-in service.',
  moduleKitchen: 'Kitchen display',
  moduleKitchenHint: 'Sends orders to the kitchen screen and prints kitchen tickets.',
  moduleQrmenu: 'QR menu',
  moduleQrmenuHint: 'A digital menu customers open on their phones.',
  panelTitle: 'Business type',
  panelHint:
    'Choose what this terminal is used for. Turning a module off hides its screens; nothing is deleted.',
  modules: 'Modules',
};
