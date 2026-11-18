/* A tentative definition (common with -fcommon), defined for real in common-b.c. */
int shared;
int also_common;

int rf_init(void) { return shared + also_common; }
