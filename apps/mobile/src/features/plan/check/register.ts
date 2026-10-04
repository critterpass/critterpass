/**
 * The plan check joins the app: its screens in the registry (./screens) and the renderer of the
 * private ask's inbox row.
 */
import { registerAskInboxRenderer } from './ask-inbox';
import './screens';

registerAskInboxRenderer();
