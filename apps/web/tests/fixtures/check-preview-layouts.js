async page => {
  const platforms=['Instagram','Facebook','YouTube','TikTok','Pinterest'];
  const colors=['rgb(0, 55, 107)','rgb(8, 102, 255)','rgb(6, 95, 212)','rgb(255, 255, 255)','rgb(17, 17, 17)'];
  const results=[];
  for(let i=0;i<platforms.length;i++){
    await page.setViewportSize({width:1100,height:1100});
    await page.getByRole('button',{name:'预览效果',exact:true}).nth(i).click();
    const dialog=page.getByRole('dialog');
    const tags=await dialog.locator('.preview-hashtag').evaluateAll(es=>es.map(e=>({text:e.textContent,color:getComputedStyle(e).color})));
    if(tags.length!==2||tags.some(tag=>tag.color!==colors[i]))throw Error(platforms[i]+' hashtag color mismatch '+JSON.stringify(tags));
    await page.screenshot({path:'output/playwright/'+platforms[i].toLowerCase()+'-preview-final.png'});
    await page.setViewportSize({width:390,height:844});
    const fits=await dialog.evaluate(el=>el.getBoundingClientRect().right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth);
    if(!fits)throw Error(platforms[i]+' overflows mobile viewport');
    await dialog.getByRole('button',{name:'下一张',exact:true}).click();
    if(!await dialog.getByText('2/2',{exact:true}).count())throw Error(platforms[i]+' carousel did not change');
    await page.screenshot({path:'output/playwright/'+platforms[i].toLowerCase()+'-preview-mobile.png'});
    await page.keyboard.press('Escape');
    results.push({platform:platforms[i],tags,carousel:true,mobile:true});
  }
  return results;
}
