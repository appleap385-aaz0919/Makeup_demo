package app.hwasaek.android;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ReplacementSpan;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.*;
import android.widget.*;

/** In-app layer: shares the editor's safe area, without dimming the system bars. */
final class AppPopup extends FrameLayout {
    private final LinearLayout content;
    private final FrameLayout host;
    private final Runnable onClose;
    AppPopup(FrameLayout host,String title,String message,Runnable onClose){
        super(host.getContext());this.host=host;this.onClose=onClose;
        setBackgroundColor(0x6617101d);setClickable(true);setFocusable(true);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_YES);
        setAccessibilityPaneTitle(title);
        ScrollView scroll=new ScrollView(getContext()){
            @Override protected void onMeasure(int width,int height){
                int limit=Math.max(dp(160),host.getHeight()-dp(40));
                super.onMeasure(width,MeasureSpec.makeMeasureSpec(limit,MeasureSpec.AT_MOST));
            }
        };
        scroll.setFillViewport(false);scroll.setClipToOutline(true);scroll.setBackground(shape(0xffffffff,22));scroll.setElevation(dp(16));
        content=new LinearLayout(getContext());content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(24),dp(28),dp(24),dp(16));
        scroll.addView(content,new ScrollView.LayoutParams(-1,-2));
        FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(Math.min(dp(360),Math.max(dp(220),host.getWidth()-dp(44))),-2,Gravity.CENTER);
        params.setMargins(dp(22),dp(20),dp(22),dp(20));addView(scroll,params);
        TextView heading=text(title,24,0xff302039);heading.setTypeface(null,Typeface.BOLD);add(heading,0);
        if(message!=null)add(text(message,17,0xff493951),14);
        host.addView(this,new FrameLayout.LayoutParams(-1,-1));
        heading.post(()->heading.sendAccessibilityEvent(android.view.accessibility.AccessibilityEvent.TYPE_VIEW_FOCUSED));
    }
    private int dp(int n){return Math.round(getResources().getDisplayMetrics().density*n);}
    private GradientDrawable shape(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private TextView text(String value,int size,int color){
        TextView t=new TextView(getContext());SpannableString copy=new SpannableString(value);
        // Android's default CJK line breaker can split a Korean word in the middle.
        java.util.regex.Matcher words=java.util.regex.Pattern.compile("\\S+").matcher(value);
        while(words.find())copy.setSpan(new ReplacementSpan(){
            @Override public int getSize(Paint paint,CharSequence text,int start,int end,Paint.FontMetricsInt metrics){if(metrics!=null)paint.getFontMetricsInt(metrics);return (int)Math.ceil(paint.measureText(text,start,end));}
            @Override public void draw(Canvas canvas,CharSequence text,int start,int end,float x,int top,int y,int bottom,Paint paint){canvas.drawText(text,start,end,x,y,paint);}
        },words.start(),words.end(),Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        t.setText(copy);t.setTextSize(size);t.setTextColor(color);t.setLineSpacing(dp(4),1);return t;
    }
    private void add(View view,int top){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(top);content.addView(view,p);}
    void detail(String value){add(text(value,13,0xff75647c),16);}
    void action(String label,Runnable click){
        Button b=new Button(getContext());b.setText(label);b.setTextSize(16);b.setTypeface(null,Typeface.BOLD);b.setAllCaps(false);b.setTextColor(0xffffffff);b.setMinHeight(dp(52));b.setMinimumHeight(dp(52));b.setPadding(dp(12),dp(8),dp(12),dp(8));
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33ffffff),shape(0xff5b21b6,13),null));b.setElevation(0);
        b.setOnClickListener(v->{close();click.run();});add(b,24);
    }
    void secondary(String label,Runnable click){TextView link=link(label,click);add(link,5);}
    private TextView link(String label,Runnable click){TextView t=text(label,13,0xff75647c);t.setGravity(Gravity.CENTER);t.setMinHeight(dp(44));t.setMinWidth(dp(44));t.setPadding(dp(4),0,dp(4),0);t.setBackground(new RippleDrawable(ColorStateList.valueOf(0x145b21b6),null,shape(0xffffffff,8)));t.setOnClickListener(v->click.run());t.setFocusable(true);t.setClickable(true);t.setAccessibilityDelegate(new View.AccessibilityDelegate(){@Override public void onInitializeAccessibilityNodeInfo(View host,android.view.accessibility.AccessibilityNodeInfo info){super.onInitializeAccessibilityNodeInfo(host,info);info.setClassName(Button.class.getName());}});return t;}
    void legal(Runnable privacy,Runnable terms,Runnable exit){
        LinearLayout row=new LinearLayout(getContext());row.setGravity(Gravity.CENTER);
        for(Object[] item:new Object[][]{{"개인정보 처리방침",privacy},{"이용약관",terms},{"종료",exit}}){if(item[1]==null)continue;LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,-2);p.setMargins(dp(3),0,dp(3),0);row.addView(link((String)item[0],(Runnable)item[1]),p);}
        add(row,8);
    }
    void close(){if(getParent()!=null){host.removeView(this);onClose.run();}}
}
