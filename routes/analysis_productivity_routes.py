from pathlib import Path
import base64
import io

from flask import Blueprint, jsonify, render_template, request, send_from_directory
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

analysis_bp = Blueprint("analysis_productivity", __name__)
BASE_DIR = Path(__file__).resolve().parent.parent
PRODUCTIVITY_CSV = BASE_DIR / 'static' / 'analysis-productivity' / 'social_media_vs_productivity.csv'

## eda project routes
## optimization project routes
@analysis_bp.route('/analysis-productivity')
def analysis_productivity():
    return render_template('analysis-productivity/index.html')

#Saves uploaded file into directory and return list of column names ## this function is for bet stats ..
@analysis_bp.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No Files Uploaded'})
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected File'})
    
        file_path = BASE_DIR / 'static' / file.filename
        file.save(file_path)
    #session['file_path'] = file_path # saves file_path in session to use among other functions
    #Use session.get('file_path'), where the string passed between [] above is passed into the session.get function, to get the file_path string set

    try:
        df  = pd.read_csv(file_path, sep=",", quotechar='"')
        info = df.columns.tolist()
        return jsonify({'info': info})
    except Exception as e:
        return jsonify({'error': str(e)})
    
#Send CSV contents over to front end
@analysis_bp.route('/print_csv_headers')
def print_csv_headers():
    try:
        df = pd.read_csv(PRODUCTIVITY_CSV, sep=',', quotechar='"') 
        columns = df.columns.tolist()
        dtypes = df.dtypes.apply(lambda x: x.name).to_dict()
        return jsonify({'columns':columns, 'dtypes':dtypes})
    except Exception as e:
        return jsonify({'error' : str(e)})

#Filter CSV contents over to front end
@analysis_bp.route('/print_filtered_csv')
def print_filtered_csv():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"')
        # Replace NaN or Infinite with None
        df = df.replace([np.nan, np.inf, -np.inf], None)
        # Filter data frame and make new data frame
        new_df = df.loc[df['age'] > 30, ['job_satisfaction_score', 'screen_time_before_sleep']].head(100)
        # Make data frame JSON transferrable
        new_df = new_df.to_dict(orient = 'records')
        return jsonify({'df':new_df})
    except Exception as e:
        return jsonify({'error' : str(e)})
    
#Fetch different sections
@analysis_bp.route('/section_0')
def section_0():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 
        buffer = io.StringIO()
        df.info(buf=buffer)
        output = buffer.getvalue()
        return jsonify(output=output)

    except Exception as e:
        return jsonify({'error' : str(e)})
    
@analysis_bp.route('/section_1')
def section_1():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 
        #Check correlations between attributes
        df_corr = df.corr(numeric_only=True)
        #Unstack to see pairs next to each other; easy access
        df_corr = df_corr.unstack()
        #Filter and sort highest correlations
        high_corr = df_corr[(df_corr > 0.5) & (df_corr < 1)]  # exclude 1 (self-correlation)
        high_corr = high_corr.sort_values(ascending=False)
        #Drop duplicates
        high_corr.drop_duplicates(inplace=True)
        high_corr = high_corr.rename('top_correlations')
        buffer = io.StringIO() 
        print(high_corr, file=buffer) #Send file to buffer from StringIO instead of python console
        output = buffer.getvalue()

        return jsonify(output=output)
    except Exception as e:
        return jsonify({'error' : str(e)})
    
@analysis_bp.route('/section_2')
def section_2():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 
        result = df.dtypes #Returns new DF, but does not print to console (for .describe())
        output = df.dtypes.apply(lambda x: x.name).to_dict()
        return jsonify(output=output)
    except Exception as e:
        return jsonify({'error' : str(e)})
    
@analysis_bp.route('/section_3')
def section_3():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 
        #dfjs = df_job_satifaction_social_media, check correlations between social media and job satisfaction
        dfjs = df.iloc[:, [3, 8, 10, 11, 14, 17, 18]]
        dfjs_corr = dfjs.corr()
        dfjs_corr_unstacked = dfjs_corr.unstack()
        dfjs_corr_unstacked = dfjs_corr_unstacked[(dfjs_corr_unstacked < 1)].sort_values(ascending=False)
        dfjs_corr_unstacked.drop_duplicates(inplace=True)
        dfjs_corr_unstacked = dfjs_corr_unstacked.rename('more_correlations')
        buffer = io.StringIO() 
        print(dfjs_corr_unstacked, file=buffer) #Send file to buffer from StringIO instead of python console - note that need to print the series bc does not print itself to console
        output = buffer.getvalue()
        return jsonify(output=output)
    except Exception as e:
        return jsonify({'error' : str(e)})
    
@analysis_bp.route('/section_4')
def section_4():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 

        dfjs = df.iloc[:, [3, 8, 10, 11, 14, 17, 18]]
        corr_matrix = dfjs.corr()

        mask = np.triu(np.ones_like(corr_matrix, dtype=bool))
        plt.figure(figsize=(10, 8))
        sns.heatmap(corr_matrix, mask=mask, annot=True, cmap='coolwarm', linewidths=0.5)
        plt.title('Correlation Heatmap')
        plt.tight_layout()

        # Save plot to a buffer
        buf = io.BytesIO() 
        plt.savefig(buf, format='png')
        plt.close()
        buf.seek(0)

        #Encode as base64
        encoded = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()
        return jsonify({'image' : f'data:image/png;base64,{encoded}'})
    
    except Exception as e:
        return jsonify({'error' : str(e)})
    
@analysis_bp.route('/section_5')
def section_5():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 
        result = df.groupby('age')[['daily_social_media_time', 'actual_productivity_score', 'screen_time_before_sleep']].agg('mean')
        result = result.reset_index()
        output = result.to_dict(orient = 'records')
        return jsonify(output=output)
    except Exception as e:
        return jsonify({'error' : str(e)})

@analysis_bp.route('/section_6')
def section_6():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 
        # Try grouping with age bins to point differences
        bins = [0, 30, 40, 50, 60, 100]
        labels = ['<30', '31-40', '41-50', '51-60', '60+']
        df['age_group'] = pd.cut(df['age'], bins=bins, labels=labels, right=True)

        # Group by age group and take mean of selected columns
        grouped = df.groupby('age_group')[['daily_social_media_time', 'actual_productivity_score', 'screen_time_before_sleep']].agg(['mean', 'median'])
        grouped.columns = ['_'.join(col).strip() for col in grouped.columns.values]
        result = grouped.reset_index() #turn index (since group by turns into it's own column) into column for front end rendering
        output = result.to_dict(orient = 'records')
        return jsonify({'columns' : result.columns.tolist(), 'output' : output})

    except Exception as e:
        return jsonify({'error' : str(e)})

@analysis_bp.route('/section_7')
def section_7():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 

        #See distribution of screen time before sleep
        plt.figure(figsize=(10, 8))
        plt.hist(df['screen_time_before_sleep'], bins=10, edgecolor='black')
        plt.title('Distribution of Screen Time Before Sleep')
        plt.xlabel('Hours')
        plt.ylabel('Frequency')
        plt.show()
        plt.tight_layout

        # Save plot to a buffer
        buf = io.BytesIO() 
        plt.savefig(buf, format='png')
        plt.close()
        buf.seek(0)

        #Encode as base64
        encoded = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()

        return jsonify({'image' : f'data:image/png;base64,{encoded}'})
    except Exception as e:
        return jsonify({'error' : str(e)})
    
@analysis_bp.route('/section_8')
def section_8():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 


        bins = [0, 18, 30, 40, 50, 60, 100]
        labels = ['<18', '18-30', '31-40', '41-50', '51-60', '60+']
        df['age_group'] = pd.cut(df['age'], bins=bins, labels=labels, right=True)
        df.groupby('age_group')['screen_time_before_sleep'].mean().plot(kind='bar')
        plt.figure(figsize=(10, 8))
        plt.title('Avg Screen Time Before Sleep by Age Group')
        plt.ylabel('Hours')
        plt.xlabel('Age Group')
        plt.show()
        sns.boxplot(x='age_group', y='screen_time_before_sleep', data=df)
        plt.title('Screen Time Distribution by Age Group')
        plt.show()
        plt.tight_layout

        # Save plot to a buffer
        buf = io.BytesIO() 
        plt.savefig(buf, format='png')
        plt.close()
        buf.seek(0)

        #Encode as base64
        encoded = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()

        return jsonify({'image' : f'data:image/png;base64,{encoded}'})
    except Exception as e:
        return jsonify({'error' : str(e)})

@analysis_bp.route('/section_9')
def section_9():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 

        screen_bins = [0, 1, 2, 3, 5]
        screen_labels = ['<1', '1-2', '2-3', '3-5']
        df['screen_group'] = pd.cut(df['screen_time_before_sleep'], bins=screen_bins, labels=screen_labels, right=True)
        age_bins = [0, 20, 30, 40, 100]
        age_labels = ['<20', '21-30', '31-40', '40+']
        df['age_group'] = pd.cut(df['age'], bins=age_bins, labels=age_labels)
        cross_tab = df.groupby(['age_group', 'screen_group']).size().unstack()
        print(cross_tab)

        plt.figure(figsize=(10,8))
        sns.heatmap(cross_tab, annot=True, fmt='d', cmap='YlGnBu')
        plt.title('Screen Time Before Sleep Across Age Groups')
        plt.ylabel('Age Group')
        plt.xlabel('Screen Time Group')
        plt.show()
        plt.tight_layout

        # Save plot to a buffer
        buf = io.BytesIO() 
        plt.savefig(buf, format='png')
        plt.close()
        buf.seek(0)

        #Encode as base64
        encoded = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()

        return jsonify({'image' : f'data:image/png;base64,{encoded}'})
    except Exception as e:
        return jsonify({'error' : str(e)})
    
@analysis_bp.route('/section_10')
def section_10():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 

        age_range = [0, 18, 30, 50, 70]
        age_range_labels = ['0-18', '18-30', '30-50', '50-70']
        df['age_range'] = pd.cut(df['age'], bins=age_range, labels=age_range_labels)
        actual_productivity_range = [0, 2, 4, 6, 8, 10]
        actual_productivity_range_labels = ['0-2', '2-4', '4-6', '6-8', '8-10']
        df['actual_productivity_range'] = pd.cut(df['actual_productivity_score'], bins=actual_productivity_range, labels=actual_productivity_range_labels)
        df_ct_demographic_productivity = df.groupby(['gender', 'age_range', 'actual_productivity_range']).size().unstack('actual_productivity_range')
        plt.figure(figsize=(10,8))
        sns.heatmap(df_ct_demographic_productivity, annot=True, fmt='d', cmap='YlGnBu')
        plt.title('Productivity across age groups')
        plt.ylabel('Age Group/Gender')
        plt.xlabel('Productivity')
        plt.show()
        plt.tight_layout

        # Save plot to a buffer
        buf = io.BytesIO() 
        plt.savefig(buf, format='png')
        plt.close()
        buf.seek(0)

        #Encode as base64
        encoded = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()

        return jsonify({'image' : f'data:image/png;base64,{encoded}'})
    except Exception as e:
        return jsonify({'error' : str(e)})
    
@analysis_bp.route('/section_11')
def section_11():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 

        age_range = [0, 18, 30, 50, 70]
        age_range_labels = ['0-18', '18-30', '30-50', '50-70']
        df['age_range'] = pd.cut(df['age'], bins=age_range, labels=age_range_labels)
        actual_productivity_range = [0, 2, 4, 6, 8, 10]
        actual_productivity_range_labels = ['0-2', '2-4', '4-6', '6-8', '8-10']
        df['actual_productivity_range'] = pd.cut(df['actual_productivity_score'], bins=actual_productivity_range, labels=actual_productivity_range_labels)
        df_ct_demographic_productivity = df.groupby(['gender', 'age_range', 'actual_productivity_range']).size().unstack('actual_productivity_range')
        
        df_ct_demographic_productivity_percentage_per_group = df_ct_demographic_productivity.div(df_ct_demographic_productivity.sum(axis=1), axis=0)
        df_ct_demographic_productivity_percentage_per_group_formatted = df_ct_demographic_productivity_percentage_per_group.applymap(lambda x: f"{x*100:.2f}%")
        #above line not necessary, just testing formatting

        plt.figure(figsize=(10,8))
        sns.heatmap(df_ct_demographic_productivity_percentage_per_group, annot=True, fmt='.1%', cmap='YlGnBu')
        plt.title('Productivity across age groups')
        plt.ylabel('Age Group/Gender')
        plt.xlabel('Productivity')
        plt.show()
        plt.tight_layout

        # Save plot to a buffer
        buf = io.BytesIO() 
        plt.savefig(buf, format='png')
        plt.close()
        buf.seek(0)

        #Encode as base64
        encoded = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()

        return jsonify({'image' : f'data:image/png;base64,{encoded}'})
    except Exception as e:
        return jsonify({'error' : str(e)})
    
@analysis_bp.route('/section_12')
def section_12():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 
        #Bin age into ranges
        age_range = [0, 18, 30, 50, 70]
        age_range_labels = ['0-18', '18-30', '30-50', '50-70']
        df['age_range'] = pd.cut(df['age'], bins=age_range, labels=age_range_labels)
        
        result = df.groupby(['age_range', 'gender'])['actual_productivity_score'].median().unstack().reset_index()
        result.columns.name = None
        output=result.to_dict(orient='records')

        return jsonify({'columns' : result.columns.tolist(), 'output' : output})

    except Exception as e:
        return jsonify({'error' : str(e)})
    

@analysis_bp.route('/section_13')
def section_13():
    try:
        file_path = PRODUCTIVITY_CSV
        df = pd.read_csv(file_path, sep=',', quotechar='"') 
        #Bin age into ranges
        age_range = [0, 18, 30, 50, 70]
        age_range_labels = ['0-18', '18-30', '30-50', '50-70']
        df['age_range'] = pd.cut(df['age'], bins=age_range, labels=age_range_labels)
        
        result = df.groupby(['age_range', 'gender']).size().unstack().reset_index()
        result.columns.name = None
        output=result.to_dict(orient='records')

        return jsonify({'columns' : result.columns.tolist(), 'output' : output})

    except Exception as e:
        return jsonify({'error' : str(e)})
    


@analysis_bp.route('/analysis-productivity/<path:filename>')
def analysis_productivity_static_compat(filename):
    return send_from_directory(BASE_DIR / 'static' / 'analysis-productivity', filename)
