'use strict';
// Compatibility for old bookmarks; the four-seat lobby is the only setup page.
const previous=new URL(location.href),target=new URL('room-lab.html',previous);
target.searchParams.set('mode','solo');
for(const key of ['view','return'])if(previous.searchParams.has(key))target.searchParams.set(key,previous.searchParams.get(key));
location.replace(target.href);
