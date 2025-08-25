import { UITabbedPanel, UISpan } from './libs/ui.js';

import { SidebarScene } from './Sidebar.Scene.js';
import { SidebarProperties } from './Sidebar.Properties.js';
import { SidebarProject } from './Sidebar.Project.js';
import { SidebarSettings } from './Sidebar.Settings.js';

function Sidebar( editor ) {

	const strings = editor.strings;

	const container = new UITabbedPanel();
	container.setId( 'sidebar' );

	// Add collapse/expand toggle button
	const toggleButton = document.createElement( 'div' );
	toggleButton.id = 'sidebar-toggle';
	toggleButton.innerHTML = '‹';
	toggleButton.title = 'Collapse sidebar';
	
	let isCollapsed = false;
	
	toggleButton.addEventListener( 'click', function () {
		
		isCollapsed = !isCollapsed;
		const sidebar = document.getElementById( 'sidebar' );
		const resizer = document.getElementById( 'resizer' );
		
		if ( isCollapsed ) {
			
			sidebar.classList.add( 'collapsed' );
			resizer.classList.add( 'sidebar-collapsed' );
			toggleButton.innerHTML = '›';
			toggleButton.title = 'Expand sidebar';
			
		} else {
			
			sidebar.classList.remove( 'collapsed' );
			resizer.classList.remove( 'sidebar-collapsed' );
			toggleButton.innerHTML = '‹';
			toggleButton.title = 'Collapse sidebar';
			
		}
		
		// Trigger viewport resize after animation completes
		setTimeout( function () {
			// When collapsed, stretch viewport/script/player fully to the right edge
			const targetRight = isCollapsed ? '40px' : ( getComputedStyle( document.getElementById( 'sidebar' ) ).width );
			document.getElementById( 'viewport' ).style.right = targetRight;
			document.getElementById( 'player' ).style.right = targetRight;
			document.getElementById( 'script' ).style.right = targetRight;
			editor.signals.windowResize.dispatch();
			
		}, 300 );
		
	} );
	
	container.dom.appendChild( toggleButton );

	const sidebarProperties = new SidebarProperties( editor );

	const scene = new UISpan().add(
		new SidebarScene( editor ),
		sidebarProperties
	);
	const project = new SidebarProject( editor );
	const settings = new SidebarSettings( editor );

	container.addTab( 'scene', strings.getKey( 'sidebar/scene' ), scene );
	container.addTab( 'project', strings.getKey( 'sidebar/project' ), project );
	container.addTab( 'settings', strings.getKey( 'sidebar/settings' ), settings );
	container.select( 'scene' );

	const sidebarPropertiesResizeObserver = new ResizeObserver( function () {

		sidebarProperties.tabsDiv.setWidth( getComputedStyle( container.dom ).width );

	} );

	sidebarPropertiesResizeObserver.observe( container.tabsDiv.dom );

	return container;

}

export { Sidebar };
